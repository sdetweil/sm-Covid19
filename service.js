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
	var waiting = { countries: [], states: [], counties: [] };
	const sourceurls = {
		states:
			"https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv",
		countries:
			"https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv",
		// changed 12/17/2020 .. ecdc source dropped
		//"https://opendata.ecdc.europa.eu/covid19/casedistribution/csv",
		counties:
			"https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-counties.csv",
	};

	datafields = {
		countries: {
			// changed starting `12/17/20
			/*
			date_fieldname: "dateRep",
			cases_fieldname: "cases",
			deaths_fieldname: "deaths",
			location_fieldname: "countriesAndTerritories",
			geo_fieldname: "geoid", */
			date_fieldname: "date",
			cases_fieldname: "total_cases",
			deaths_fieldname: "total_deaths",
			location_fieldname: "location",
			geo_fieldname: "continent",
		},
		states: {
			date_fieldname: "date",
			location_fieldname: "state",
			cases_fieldname: "cases",
			deaths_fieldname: "deaths",
		},
		counties: {
			date_fieldname: "date",
			location_fieldname: "county",
			statename_fieldname: "state",
			cases_fieldname: "cases",
			deaths_fieldname: "deaths",
		},
	};
	const date_mask = {
		// changed 12/17/2020 .. ecdc source dropped
		countries: "YYYY-MM-DD", // "DD/MM/YYYY",
		states: "YYYY-MM-DD",
		counities: "YYYY-MM-DD",
	};
	const charter_date_format = "MM/DD/YYYY";
	const config_date_format = "YYYY-MM-DD";
	const data_order = {
		countries: "forward",
		states: "forward",
		counties: "forward",
	};

	function geturl() {
		return countriesurl;
	}

	function waitForFile(payload) {
		return new Promise((resolve, reject) => {
			// send it back\
			if (
				payload.usePreviousFile == true &&
				fs.existsSync(payload.filename)
			)
				// no need to wait
				resolve(payload);
			else {
				// wait, save our promise notifiy functions
				payload.resolve.unshift(resolve);
				payload.reject.unshift(reject);
			}
		});
	}
	var fieldtest = {
		states: (x, payload) => {
			return (
				payload[payload.config.type].indexOf(
					x[payload.fields.location_fieldname]
				) >= 0
			);
		},
		countries: (x, payload) => {
			return (
				payload[payload.config.type].indexOf(
					x[payload.fields.location_fieldname]
				) >= 0
			);
		},
		counties: (x, payload) => {
			// get the county name from the data
			let county = x[payload.fields.location_fieldname];
			let state = x[payload.fields.statename_fieldname];
			// console.log("looking for county="+county+" and state="+state)
			// loop thru the config to see if its one we care about
			let r = payload[payload.config.type].filter((location) => {
				// if this data record  is for the selected county, check its matching state
				return (
					location.hasOwnProperty(county) && location[county] == state
				);
			});
			//console.log(" found it"+JSON.stringify(r))
			return r.length > 0;
		},
	};
	function processFileData(payload) {
		// get the start date filter if specified
		let start = payload.startDate
			? moment(payload.startDate, config_date_format).subtract(1, "d")
			: moment("12/31/2019");
		if (payload.config.type != "countries")
			start = start.subtract(2, "days");
		cvt()
			.fromFile(payload.filename) // input xls
			.subscribe((jsonObj, index) => {
				try {
					if (fieldtest[payload.config.type](jsonObj, payload)) {
						// if this location is within the date range
						let zz = moment(
							jsonObj[payload.fields.date_fieldname],
							date_mask[payload.config.type]
						);
						if (zz.isAfter(start)) {
							payload.location[
								jsonObj[payload.fields.location_fieldname]
							].push(jsonObj);
						}
					}
				} catch (error) {
					console.log(error);
				}
			})
			.then((result) => {
				// all done, tell the topmost function we completed
				payload.resolve.shift()({
					data: payload.location,
					payload: payload,
				});
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
			let fields = datafields[payload.config.type];

			if (payload.config.type != "counties")
				for (let n of payload[payload.config.type]) location[n] = [];
			else
				for (let n of payload[payload.config.type])
					location[Object.keys(n)[0]] = [];

			if (_chart_debug) {
				console.log(
					"requested file exists=" +
						xf +
						" sending back to " +
						payload.id
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
			// if we should NOT reuse the previous file
			// or
			// the file doesn't exist
			if (
				payload.usePreviousFile == false ||
				!fs.existsSync(payload.filename)
			) {
				// if we are the first
				if (waiting[payload.config.type].length == 1) {
					if (_chart_debug)
						console.log("first to be waiting " + payload.id);
					getFile(payload);
				} else {
					if (_chart_debug)
						console.log("not first waiting " + payload.id);
				}
			}
		});
	}

	function getFile(payload) {
		// send request to get file
		$http
			.get(sourceurls[payload.config.type])
			.then((response) => {
				// save the data to a file, library only reads from file
				fs.writeFile(payload.filename, response.data, (error) => {
					if (!error) {
						// wake up everyone, including us to read the file
						for (var p of waiting[payload.config.type]) {
							if (_chart_debug)
								console.log("resolving for id=" + p.id);
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
								if (_chart_debug)
									console.log("erased old file =" + xf1);
							});
						}
					} else {
						if (_chart_debug)
							console.log("file write error id=" + p.id);
						for (var p of waiting[payload.config.type]) {
							if (_chart_debug)
								console.log(
									"rejecting file write for id=" + p.id
								);
							p.reject.shift()({
								result: null,
								payload: p,
								error: error,
							});
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
						"===>error= id=" +
							payload.id +
							" " +
							JSON.stringify(error)
					);
				for (var p of waiting[payload.config.type]) {
					if (_chart_debug)
						console.log("rejecting error for id=" + p.id);
					p.reject.shift()({
						data: null,
						payload: p,
						error: error,
					});
				}
				// clear the waiting list
				waiting[payload.config.type] = [];
			});
	}

	function checkDate(date, payload) {
		// changed 12/17/2020
		if (payload.config.type == "countries1") return date.endsWith("20");
		else return date.startsWith("20");
	}
	function doGetcountries(init, payload, location) {
		return new Promise((resolve, reject) => {
			if (init == true) {
				var fields = datafields[payload.config.type];

				var results = {};

				// loop thru all the configured locations
				for (var c of Object.keys(location)) {
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
							if (true) {
								if (
									checkDate(u[fields.date_fieldname], payload)
								) {
									if (payload.config.type == "countries1") {
										cases.push({
											x: moment(
												u[fields.date_fieldname],
												date_mask[payload.config.type]
											).format(charter_date_format),
											y: parseInt(
												u[fields.cases_fieldname]
											),
										});
										deaths.push({
											x: moment(
												u[fields.date_fieldname],
												date_mask[payload.config.type]
											).format(charter_date_format),
											y: parseInt(
												u[fields.deaths_fieldname]
											),
										});
									} else {
										tcases.push({
											x: moment(
												u[fields.date_fieldname],
												date_mask[payload.config.type]
											).format(charter_date_format),
											y: parseInt(
												u[fields.cases_fieldname]
											),
										});
										tdeaths.push({
											x: moment(
												u[fields.date_fieldname],
												date_mask[payload.config.type]
											).format(charter_date_format),
											y: parseInt(
												u[fields.deaths_fieldname]
											),
										});
									}
								}
							}
						}
						if (data_order[payload.config.type] == "reverse") {
							// data presented in reverse date order, flip them
							cases = cases.reverse();
							deaths = deaths.reverse();
							// initialize cumulative counters to 0
							// make a copy
							tcases = JSON.parse(JSON.stringify(cases));
							tdeaths = JSON.parse(JSON.stringify(deaths));
							// country sends daily, calculate cumulative from daily
							for (var i = 1; i < cases.length; i++) {
								tcases[i].y += tcases[i - 1].y;
								tdeaths[i].y += tdeaths[i - 1].y;
							}
						} else {
							// make a copy
							cases = JSON.parse(JSON.stringify(tcases));
							deaths = JSON.parse(JSON.stringify(tdeaths));
							// loop thru data and create daily values from cumulative
							for (var i = cases.length - 1; i > 0; i--) {
								cases[i].y -= tcases[i - 1].y;
								deaths[i].y -= tdeaths[i - 1].y;
							}
							// remove the extra leading day used for calculations
							cases.splice(0, 2);
							deaths.splice(0, 2);
							tcases.splice(0, 2);
							tdeaths.splice(0, 2);
						}

						var d = {
							cases: cases,
							deaths: deaths,
							"cumulative cases": tcases,
							"cumulative deaths": tdeaths,
						};
						// add this location to the results
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
