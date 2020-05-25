const path = require("path");
const sfn = document.currentScript.src.substring(
  7,
  document.currentScript.src.lastIndexOf(path.sep)
);
const _chart_debug = true;
const cvt = require(path.resolve(sfn, "node_modules", "csvtojson"));

angular.module("SmartMirror").factory("_MyChartService", function ($http) {
  var service = {};
  service.getUrl = geturl;

  console.log("MyCovid19 service up and running");
  var waiting = { countries: [], states: [] };
  var location_field= {countries:3, states:1}
  const statesurl =
    "https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv";
  const countriesurl =
    "https://opendata.ecdc.europa.eu/covid19/casedistribution/csv";
  const countryfields = {"date_fieldname":"dateRep", "cases_fieldname":"cases", "deaths_fieldname":"deaths", "location_fieldname":"countriesAndTerritories", "geo_fieldname":"geoid"};
  const statefields = {"date_fieldname":"date", "location_fieldname":"state", "cases_fieldname":"cases", "deaths_fieldname":"deaths"};
  const date_mask = { countries:"DD/MM/YYYY", states:"YYYY-MM-DD"}
  const charter_date_format="MM/DD/YYYY"
  const config_date_format="YYYY-MM-DD"
  function geturl() {
    return countriesurl;
  }

  function getInitialData(payload) {
    return new Promise((resolve, reject) => {
      var xf =
        sfn +
        path.sep +
        payload.config.type +
        "-rawdata" +
        "-" +
        moment().format("MM-DD-YYYY") +
        ".csv";
      if (payload.usePreviousFile == true && fs.existsSync(xf)) {
        if (_chart_debug) {
          console.log(
            "requested file exists=" + xf + " sending back to " + payload.id
          );
        }
        // send it back
        cvt()
          .fromFile(xf) // input xls
          .then((result) => {
            resolve({ data: result, payload: payload });
          });
      } else {
        if (_chart_debug)
          if (payload.usePreviousFile == true)
            console.log("requested file does NOT exist " + payload.id);
          else console.log("refreshing requested file  for " + payload.id);
        // if we are not waiting
        var found = false;
        for (var p of waiting[payload.config.type]) {
          if (p.id == payload.id) {
            found = true;
            break;
          }
        }

        if (found == false) {
          if (_chart_debug)
            console.log("not on the list to be waiting, adding " + payload.id);
          // say we are
          payload.resolve = resolve;
          payload.reject = reject;
          waiting[payload.config.type].push(payload);
        } else {
          // already waiting?
          if (_chart_debug) console.log("already waiting " + payload.id);
        }

        // if we are the first
        if (waiting[payload.config.type].length == 1) {
          if (_chart_debug) console.log("first to be waiting " + payload.id);

          // send request to get file
          $http
            .get(payload.config.type == "countries" ? countriesurl : statesurl)
            .then((response) => {
              //console.log("url="+texturl)
              //	if(true) {
              //if(_chart_debug)
              //  console.log("have data")
              fs.writeFile(xf, response.data, (error) => {
                if (!error) {
                  cvt()
                    .fromFile(xf) // input xls
                    .then((result) => {
                      // send the response to all waiters
                      for (var p of waiting[payload.config.type]) {
                        if (_chart_debug)
                          console.log("resolving for id=" + p.id);
                        p.resolve({ data: result, payload: p });
                      }
                      // clear the waiting list
                      waiting[payload.config.type] = [];
                      // get yesterdays filename
                      var xf1 =
                        sfn +
                        path.sep +
                        payload.config.type +
                        "-rawdata" +
                        "-" +
                        moment().subtract(1, "days").format("MM-DD-YYYY") +
                        ".csv";
                      // if it exists
                      if (fs.existsSync(xf1)) {
                        // erase it
                        fs.unlink(xf1, () => {
                          if (_chart_debug)
                            console.log("erased old file =" + xf1);
                        });
                      }
                    });
                } else {
                  if (_chart_debug) console.log("file write error id=" + p.id);
                  for (var p of waiting[payload.config.type]) {
                    if (_chart_debug)
                      console.log("rejecting file write for id=" + p.id);
                    p.reject({ result: null, payload: p, error: error });
                  }
                  // clear the waiting list
                  waiting[payload.config.type] = [];
                }
              });
              /*} 
											 else if(response.statusCode > 400 ){
												if(_chart_debug)
													console.log("no file, retry id="+p.id)
												for(var p of waiting[payload.config.type]){
													if(_chart_debug)
														console.log("rejecting no file for id="+p.id)                    
													p.reject({data:null, payload:p, error:response.statusCode})    
												}
												// clear the waiting list
												waiting[payload.config.type]=[]       
											}                                */
            })
            .catch((error) => {
              console.log("get csv failed =" + JSON.stringify(error));
              if (_chart_debug)
                console.log(
                  "===>error= id=" + payload.id + " " + JSON.stringify(error)
                );
              for (var p of waiting[payload.config.type]) {
                if (_chart_debug) console.log("rejecting error for id=" + p.id);
                p.reject({ data: null, payload: p, error: error });
              }
              // clear the waiting list
              waiting[payload.config.type] = [];
            });
        } else {
          if (_chart_debug) console.log("not first waiting " + payload.id);
        }
      }
    });
  }

  function unique(list, name, payload) {
    var result = null;
    if (payload.config.debug1)
      console.log("looking for " + name + " in " + JSON.stringify(list));
    list.forEach(function (e) {
      if (e.toLowerCase().indexOf(name.toLowerCase()) >= 0) {
        result = e;
      }
    });

    return result;
  }
  function checkDate(date,payload){
    if(payload.config.type=='countries')
      return date.endsWith('20')
    else return date.startsWith("20")
  }
  function doGetcountries(init, payload, data) {
    return new Promise((resolve, reject) => {
      if (init == true) {
        // format data keyed by country name
        var location={}
        var fields = payload.config.type == "countries"? countryfields: statefields 

        // loop thru the data and make based on location vs date
        for (var entry of data) {
          let v = entry[fields.location_fieldname];
          if (payload[payload.config.type].indexOf(v) >= 0) {
            //console.log(" country geo="+JSON.stringify(entry))
            if (location[v] == undefined) {
              location[v] = [];
            }
            location[v].push(entry);
          }
        }

        var results = {};
        //if (true || payload.countries != undefined) {
          // loop thru all the configured countries
          for (var c of payload[payload.config.type]) {
            if (location[c] !==undefined) {
              var totalc = 0;
              var totald = 0;
              var cases = [];
              var deaths = [];
              var tcases = [];
              var tdeaths = [];

              // loop thru the data for that location
              for (var u of location[c]) {
                if (payload.config.debug1)
                  console.log(
                    "date=" +
                      u[fields.date_fieldname] +
                      " cases=" +
                      u[fields[fields.cases_fieldname]] +
                      " deaths=" +
                      u[fields[fields.deaths_fieldname]] +
                      " geoid=" +
                      u[fields[fields.geo_fieldname]]
                  );
                // filter out before startDate
                if (
                  payload.startDate == undefined ||
                  !moment(u[fields.date_fieldname], date_mask[payload.config.type]).isBefore(
                    moment(payload.startDate, config_date_format)
                  )
                ) {
                  if (checkDate(u[fields.date_fieldname], payload)) {
                    if(payload.config.type=='countries'){
                      cases.push({
                        x: moment(u[fields.date_fieldname], date_mask[payload.config.type]).format(
                          charter_date_format
                        ),
                        y: parseInt(u[fields.cases_fieldname]),
                      });
                      deaths.push({
                        x: moment(u[fields.date_fieldname], date_mask[payload.config.type]).format(
                          charter_date_format
                        ),
                        y: parseInt(u[fields.deaths_fieldname]),
                      });
                    } else {
                      tcases.push({
                        x: moment(u[fields.date_fieldname], date_mask[payload.config.type]).format(
                          charter_date_format
                        ),
                        y: parseInt(u[fields.cases_fieldname]),
                      });
                      tdeaths.push({
                        x: moment(u[fields.date_fieldname], date_mask[payload.config.type]).format(
                          charter_date_format
                        ),
                        y: parseInt(u[fields.deaths_fieldname]),
                      });                      
                    }
                  }
                }
              }
              if(payload.config.type=='countries'){
                // data presented in reverse date order, flip them
                cases = cases.reverse();
                deaths = deaths.reverse();
                // initialize cumulative counters to 0
                // make a copy
                tcases = JSON.parse(JSON.stringify(cases));
                tdeaths = JSON.parse(JSON.stringify(deaths));   
                // country sends daily, calculate cumulative
                for (var i = 1; i < cases.length; i++) {
                  tcases[i].y += tcases[i - 1].y;
                  tdeaths[i].y += tdeaths[i - 1].y;
                }
              } else{              
                // make a copy
                cases = JSON.parse(JSON.stringify(tcases));
                deaths = JSON.parse(JSON.stringify(tdeaths));
                // loop thru data and create cumulative counters
                for (var i = cases.length - 1; i > 0; i--) {
                  cases[i].y -= tcases[i - 1].y;
                  deaths[i].y -= tdeaths[i - 1].y;
                }
              }

              var d = {
                cases: cases,
                deaths: deaths,
                "cumulative cases": tcases,
                "cumulative deaths": tdeaths
              };
              //if(payload.config.debug)
              //  console.log("data returned ="+JSON.stringify(d))
              // add this country to the results
              results[c] = d;
            }
          }
      /* } 
          else {
          // loop thru all the configured states
          for (var c of payload[payload.config.type]) {
            if (location[c] !==undefined) {
              var totalc = 0;
              var totald = 0;
              var cases = [];
              var deaths = [];
              var tcases = [];
              var tdeaths = [];
              if (payload.config.debug1)
                console.log(
                  "there are " + location[c].length + " entries for state=" + c
                );
              for (var u of location[c]) {
                if (payload.config.debug1)
                  console.log(
                    "date=" +
                      u[fields.date_fieldname] +
                      " cases=" +
                      u[fields.cases_fieldname] +
                      " deaths=" +
                      u[fields.deaths_fieldname]
                  );
                // filter out before startDate
                if (
                  payload.startDate == undefined ||
                  !moment(u[fields.date_fieldname], date_mask[payload.config.type]).isBefore(
                    moment(payload.startDate, "YYYY-MM-DD")
                  )
                ) {
                  if (checkDate(u[fields.date_fieldname], payload)) {
                    tcases.push({
                      x: moment(u[fields.date_fieldname], date_mask[payload.config.type]).format(
                        charter_date_format
                      ),
                      y: parseInt(u[fields.cases_fieldname]),
                    });
                    tdeaths.push({
                      x: moment(u[fields.date_fieldname], date_mask[payload.config.type]).format(
                        charter_date_format
                      ),
                      y: parseInt(u[fields.deaths_fieldname]),
                    });
                  }
                }
              }
              // make a copy
              cases = JSON.parse(JSON.stringify(tcases));
              deaths = JSON.parse(JSON.stringify(tdeaths));
              // loop thru data and create cumulative counters
              for (var i = cases.length - 1; i > 0; i--) {
                cases[i].y -= tcases[i - 1].y;
                deaths[i].y -= tdeaths[i - 1].y;
              }

              var d = {
                cases: cases,
                deaths: deaths,
                "cumulative cases": tcases,
                "cumulative deaths": tdeaths,
              };
              //if(payload.config.debug)
              //  console.log("data returned ="+JSON.stringify(d))
              // add this country to the results
              results[c] = d;
            } 
          } 
        } */
        // send the data on to the display module
        resolve({ id: payload.id, config: payload, data: results });
        // sendSocketNotification('Data', {id:payload.id, config:payload.config, data:results})
      }
    });
  }
  function getData(init, payload) {
    return new Promise((resolve, reject) => {
      if (init == true) {
        getInitialData(payload)
          .then((output) => {
            //if(payload.config.debug) console.log("data data="+JSON.stringify(data))
            doGetcountries(init, output.payload, output.data)
              .then((data) => {
                resolve(data);
              })
              .catch((error) => {
                reject(error);
              });
          })
          .catch((error) => {
            console.log("sending no data available notification");
            reject(error);
          });
      }
    });
  }

  service.getData = getData;

  return service;
});
