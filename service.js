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
  var location_field = { countries: 3, states: 1 };

  const statesurl =
    "https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv";
  const countriesurl =
    "https://opendata.ecdc.europa.eu/covid19/casedistribution/csv";
  const countryfields = {
    date_fieldname: "dateRep",
    cases_fieldname: "cases",
    deaths_fieldname: "deaths",
    location_fieldname: "countriesAndTerritories",
    geo_fieldname: "geoid",
  };
  const statefields = {
    date_fieldname: "date",
    location_fieldname: "state",
    cases_fieldname: "cases",
    deaths_fieldname: "deaths",
  };
  const date_mask = { countries: "DD/MM/YYYY", states: "YYYY-MM-DD" };
  const charter_date_format = "MM/DD/YYYY";
  const config_date_format = "YYYY-MM-DD";
  function geturl() {
    return countriesurl;
  }

  function waitForFile(payload) {
    return new Promise((resolve, reject) => {
      // send it back\
      if (payload.usePreviousFile == true && fs.existsSync(payload.filename))
        // no need to wait
        resolve(payload);
      else {
        // wait, save our promise notifiy functions
        payload.resolve.unshift(resolve);
        payload.reject.unshift(reject);
      }
    });
  }
  function processFileData(payload) {
    cvt()
      .fromFile(payload.filename) // input xls
      .subscribe((jsonObj, index) => {
        try {
          if (
            payload[payload.config.type].indexOf(
              jsonObj[payload.fields.location_fieldname]
            ) >= 0
          )
            payload.location[jsonObj[payload.fields.location_fieldname]].push(
              jsonObj
            );
        } catch (error) {
          console.log(" location undefined");
        }
      })
      .then((result) => {
        // all done, tell the topmost function we completed
        payload.resolve.shift()({ data: payload.location, payload: payload });
      });
  }

  function getInitialData(payload) {
    return new Promise((resolve, reject) => {
      var xf =
        sfn +
        path.sep +
        payload.config.type +
        "-rawdata-" +
        moment().format("MM-DD-YYYY") +
        ".csv";
      let location = {};
      let fields =
        payload.config.type == "countries" ? countryfields : statefields;

      for (let n of payload[payload.config.type]) location[n] = [];

      if (_chart_debug) {
        console.log(
          "requested file exists=" + xf + " sending back to " + payload.id
        );
      }
      payload.location = location;
      payload.filename = xf;
      payload.fields = fields;
      // initialize the promise pointer arrays
      payload.resolve = [];
      payload.reject = [];
      // save our resolve/reject
      payload.resolve.push(resolve);
      payload.reject.push(reject);

      waitForFile(payload).then((payload) => {
        if (fs.existsSync(payload.filename)) {
          processFileData(payload);
        } else {
          reject("file not found=" + payload.filename);
        }
        return;
      });

      waiting[payload.config.type].push(payload);

      if (_chart_debug) {
        if (payload.usePreviousFile == true)
          console.log("requested file does NOT exist " + payload.id);
        else console.log("refreshing requested file  for " + payload.id);
      }

      // if we are the first
      if (waiting[payload.config.type].length == 1) {
        if (_chart_debug) console.log("first to be waiting " + payload.id);

        // send request to get file
        $http
          .get(payload.config.type == "countries" ? countriesurl : statesurl)
          .then((response) => {
            // save the data to a file, library only reads from file
            fs.writeFile(xf, response.data, (error) => {
              if (!error) {
                // wake up everyone, including us to read the file
                for (var p of waiting[payload.config.type]) {
                  if (_chart_debug) console.log("resolving for id=" + p.id);
                  // let all the waiting processes data is ready
                  p.resolve.shift()(p);
                }
                // clear the waiting list
                waiting[payload.config.type] = [];
                // get yesterdays filename
                var xf1 =
                  sfn +
                  path.sep +
                  payload.config.type +
                  "-rawdata-" +
                  moment().subtract(1, "days").format("MM-DD-YYYY") +
                  ".csv";
                // if it exists
                if (fs.existsSync(xf1)) {
                  // erase it
                  fs.unlink(xf1, () => {
                    if (_chart_debug) console.log("erased old file =" + xf1);
                  });
                }
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
  function checkDate(date, payload) {
    if (payload.config.type == "countries") return date.endsWith("20");
    else return date.startsWith("20");
  }
  function doGetcountries(init, payload, location) {
    return new Promise((resolve, reject) => {
      if (init == true) {
        var fields =
          payload.config.type == "countries" ? countryfields : statefields;

        var results = {};

        // loop thru all the configured locations
        for (var c of payload[payload.config.type]) {
          if (location[c] !== undefined) {
            var totalc = 0;
            var totald = 0;
            var cases = [];
            var deaths = [];
            var tcases = [];
            var tdeaths = [];

            // loop thru the data for that location
            for (var u of location[c]) {
              // filter out before startDate
              if (
                payload.startDate == undefined ||
                !moment(
                  u[fields.date_fieldname],
                  date_mask[payload.config.type]
                ).isBefore(moment(payload.startDate, config_date_format))
              ) {
                if (checkDate(u[fields.date_fieldname], payload)) {
                  if (payload.config.type == "countries") {
                    cases.push({
                      x: moment(
                        u[fields.date_fieldname],
                        date_mask[payload.config.type]
                      ).format(charter_date_format),
                      y: parseInt(u[fields.cases_fieldname]),
                    });
                    deaths.push({
                      x: moment(
                        u[fields.date_fieldname],
                        date_mask[payload.config.type]
                      ).format(charter_date_format),
                      y: parseInt(u[fields.deaths_fieldname]),
                    });
                  } else {
                    tcases.push({
                      x: moment(
                        u[fields.date_fieldname],
                        date_mask[payload.config.type]
                      ).format(charter_date_format),
                      y: parseInt(u[fields.cases_fieldname]),
                    });
                    tdeaths.push({
                      x: moment(
                        u[fields.date_fieldname],
                        date_mask[payload.config.type]
                      ).format(charter_date_format),
                      y: parseInt(u[fields.deaths_fieldname]),
                    });
                  }
                }
              }
            }
            if (payload.config.type == "countries") {
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
            } else {
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
              "cumulative deaths": tdeaths,
            };
            // add this country to the results
            results[c] = d;
          }
        }
        // send the data on to the display module
        resolve({ id: payload.id, config: payload, data: results });
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
