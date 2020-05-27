//const _chart_debug=true
const Chart = require("chart.js");

var __chartcontrollerFunctions = {};
var timeout = null;
var ctx = {};

angular
  .module("SmartMirror")
  .controller("MyCovid19", function (
    $scope,
    $translate,
    $timeout,
    _MyChartService,
    SpeechService,
    Focus
  ) {
    var Covid19_charts = {};
    var charts = {};
    var attribution_label = {
      countries: "European Centre for Disease Prevention and Control",
      states: "NY Times",
    };
    $scope.MyCovid19 = {
      config: config.mycovid19,
      attributions: attribution_label,
    };

    timeout = $timeout;
    //__chartcontrollerFunctions.scope=$scope
    const newFileAvailableTimeofDay = { countries: 2, states: 8 };
    const retryDelay = 15;
    var ticklabel = {};
    let timeout_handle = {};

    $timeout(() => {
      for (let column of config.mycovid19) {
        for (let chart in column.charts) {
          let canvas = document.getElementById(column.position + chart);
          if (canvas != null) {
            //console.log("found canvas for "+ column.position + " "+ chart)
            __chartcontrollerFunctions.drawChart(canvas, column.charts[chart]);
          }
        }
      }
    }, 500);

    SpeechService.addRawCommand(
      "show chart",
      () => {
        console.log("changing to Covid19 charts");
        Focus.change("charts");
      },
      "show the COVid19 charts on chart focus",
      "show chart"
    );

    __chartcontrollerFunctions.drawChart = (canvas, chart) => {
      console.log(
        "start found canvas for chart=" + chart.chartname + " id=" + canvas.id
      );
      ctx[canvas.id] = canvas.getContext("2d");
      ctx[canvas.id].font = "20px Georgia";
      ctx[canvas.id].fillText("Hello World!", 10, 50);

      ctx[canvas.id].font = "30px Verdana";
      // Create gradient
      let gradient = ctx[canvas.id].createLinearGradient(
        0,
        0,
        parseInt(chart.chartwidth),
        0
      );
      gradient.addColorStop("0", " magenta");
      gradient.addColorStop("0.5", "blue");
      gradient.addColorStop("1.0", "red");
      // Fill with gradient
      ctx[canvas.id].fillStyle = gradient;
      ctx[canvas.id].textAlign = "center";
      ctx[canvas.id].fillText(
        "Big smile!",
        parseInt(chart.chartwidth) / 2,
        parseInt(chart.chartheight) / 2
      );
      console.log(
        "done  found canvas for chart=" + chart.chartname + " id=" + canvas.id
      );
      chart.id = canvas.id;

      if (chart.states != undefined) {
        let x = chart.states.split(",");
        let y = x.length;
        for (let i = 0; i < y; i++) {
          x[i] = x[i].toString().trim();
        }
        chart.states = [];
        chart.states = x.slice();
      } else {
        let x = chart.countries.split(",");
        let y = x.length;
        for (let i = 0; i < y; i++) {
          x[i] = x[i].toString().trim();
        }
        chart.countries = x.slice();
      }

      let x = chart.colorsforsource.split(",");
      for (let i in x) x[i] = x[i].toString().trim();
      chart.colorsforsource = x;
      chart["config"] = {};
      chart.config.type =
        chart.countries !== undefined ? "countries" : "states";
      chart["countrylist"] = chart[chart.config.type].slice();
      if (chart.config.type == "countries") {
        for (let i = 0; i < chart.countries.length; i++) {
          switch (chart.countries[i].toLowerCase()) {
            case "us":
            case "usa":
            case "united states":
              // code block
              chart.countries[i] = "United_States_of_America";
              break;
            case "uk":
              chart.countries[i] = "United Kingdom";
            default:
              chart.countries[i] = chart.countries[i].replace(" ", "_");
            // code block
          }
        }
      }
      setTimerForNextRefresh(
        { id: canvas.id, canvas: canvas, config: chart, ticklabel: {}, x: {} },
        1,
        "seconds"
      );
    };

    function refreshData(payload) {
      console.log(payload.id + " timer popped " + moment().format());
      if (_chart_debug)
        console.log(payload.id + " refreshing " + moment().format());
      _MyChartService.getData(true, payload.config).then((data) => {
        console.log(payload.id + " received data =" + JSON.stringify(data));
        payload.data = data.data;
        drawonCanvas(payload.canvas, payload);
      });
    }

    function drawonCanvas(canvas, payload) {
      // make a hash to avoid collisions
      var __$ds = {};
      // has by our instance ID, which has a random number included
      if (__$ds[payload.id] == undefined) __$ds[payload.id] = {};
      // either states or countries
      payload.config.type = payload.config.config.type;
      __$ds[payload.id][payload.config.type] = [];

      // loop thru the configured location (state or country)
      // each instance (this/self) is ONE report of multiple lines of the same location type and data type, cases or deaths
      for (
        payload.x[payload.id] = 0;
        payload.x[payload.id] < payload.config[payload.config.type].length;
        payload.x[payload.id]++
      ) {
        var location =
          payload.config[payload.config.type][payload.x[payload.id]];

        // make sure there is data for this selection (spelling errors etc)
        if (payload.data != undefined) {
          // create a new dataset description, one for each location
          // multiple states or countries
          try {
            __$ds[payload.id][payload.config.type].push({
              xAxisID: "dates",
              data: payload.data[location][payload.config.charttype], // < -----   data for this dataset
              fill: false,
              borderColor:
                payload.config.colorsforsource[payload.x[payload.id]], // Add custom color border (Line)
              backgroundColor:
                payload.config.colorsforsource[payload.x[payload.id]],
              label: payload.config.countrylist[payload.x[payload.id]],
              showInLegend: true,
            });
          } catch (error) {
            console.log("data error=" + error);
          }
        }
      }
      createTickLabels(payload);
      payload.data = __$ds;

      //      var info = {  ourID:canvas.id ,canvas:canvas,  data:__$ds, config: payload.config, ticklabel:payload.ticklabel }

      dodraw(payload);
    }
    function createTickLabels(payload) {
      var countries = Object.keys(payload.data);
      //  get the data for the 1st country, all symetrical
      var first_country_data = payload.data[countries[0]];

      // get the date from the last entry of cases
      var last_date = first_country_data["cases"].slice(-1)[0].x;
      // convert to moment, in mm/dd/yyyy layout
      const lastMoment = moment(last_date, "MM/DD/YYYY");
      // get now as a moment
      const now = moment();
      // if its states, the data date lages 1 day
      if (payload.config.states != undefined) {
        now.subtract(1, "d");
      }
      // get just the date of now
      const currentMoment_date = now.format("MM/DD/YYYY");
      if (payload.ticklabel[payload.id] == undefined) {
        payload.ticklabel[payload.id] = [];
      }
      // if the last data element date matches today, data is current
      //if(lastMoment.format('MM/DD/YYYY') == currentMoment_date || self.displayedOnce==false){
      // get first tick from the data
      payload.ticklabel[payload.id].push(
        first_country_data["cases"].slice(1)[0].x
      );
      var firstdate = moment(payload.ticklabel[payload.id][0], "MM/DD/YYYY");
      for (var i = firstdate.month() + 2; i <= lastMoment.month() + 1; i++) {
        payload.ticklabel[payload.id].push(i + "/1/2020");
      }

      // if the last date in the data isn't a month boundary
      if (last_date != lastMoment.month() + 1 + "/1/2020")
        // add the specific date entry to the list of Label to display
        // the month would have been added by the loop above
        payload.ticklabel[payload.id].push(last_date);
      // }
      if (lastMoment.format("MM/DD/YYYY") !== currentMoment_date) {
        if (_chart_debug)
          console.log(
            "have data last entry does NOT match today " +
              currentMoment_date +
              " id=" +
              payload.id
          );
        setTimerForNextRefresh(payload, retryDelay, "minutes");
      } else {
        if (_chart_debug)
          console.log(
            "have data last entry  DOES match today " +
              currentMoment_date +
              " id=" +
              payload.id
          );
        setTimerForNextRefresh(
          payload,
          newFileAvailableTimeofDay[payload.config.type],
          "hours"
        );
      }
    }
    function dodraw(payload) {
      var chartOptions = {
        layout: {
          padding: {
            left: 30,
            right: 0,
            top: 0,
            bottom: 0,
          },
        },

        title: {
          display: false,
          text: payload.config.chart_title,
          fontColor: "white",
        },
        legend: {
          //  display: true,
          position: "bottom",
          textAlign: "right",
          labels: { boxWidth: 10 },
        },
        tooltips: {
          enabled: true,
          displayColors: true,
          position: "nearest",
          intersect: false,
        },
        responsive: false,
        elements: {
          point: {
            radius: 0,
          },
          line: {
            tension: 0, // disables bezier curves
          },
        },
        scales: {
          xAxes: [
            {
              id: "dates",
              type: "time",
              distribution: "linear",
              scaleLabel: {
                display: true,
                labelString: payload.config.xAxesLabel,
              },
              gridLines: {
                display: false,
                zeroLineColor: "#ffcc33",
              },
              time: {
                unit: "day",
                parser: "MM/DD/YYYY",
              },
              ticks: {
                display: true,
                maxRotation: 90,
                minRotation: 90,
                source: "labels",
                maxTicksLimit: ticklabel.length * 2 + 4, //10,
                autoSkip: true,
                fontColor: "white",
              },
            },
          ],
          yAxes: [
            {
              display: true,
              scaleLabel: {
                display: true,
                labelString: payload.config.yAxesLabel,
              },
              gridLines: {
                display: false,
              },

              ticks: {
                beginAtZero: true,
                source: "data",
                fontColor: "white",
                //,
                min: 0,
                // suggestedMax: self.config.ranges.max,
                //  stepSize: self.config.ranges.stepSize,
              },
            },
          ],
        },
      };
      //updateOptions(self.config, chartOptions)
      // create it now
      if (_chart_debug)
        console.log(payload.id + " about to draw chart " + moment().format());
      try {
        if (charts[payload.id] == undefined) charts[payload.id] = [];
        charts[payload.id].push(
          new Chart(payload.canvas, {
            type: "line",
            showLine: true,
            data: {
              datasets: payload.data[payload.id][payload.config.type],
              labels: payload.ticklabel[payload.id],
            },
            options: chartOptions,
          })
        );
      } catch (error) {
        console.log("chart error=" + error);
      }

      if (_chart_debug)
        console.log("done defered drawing  getDom() id=" + payload.id);

      //      payload.config.attribution="courtesy "+attribution_label[payload.config.type];
    }
    function updateOptions(config, chartOptions) {
      var defaults = false;
      var defaultFontInfo = {
        //  defaultColor : 'yourColor',
        //  defaultFontColor : 'yourColor',
        //  defaultFontFamily : 'yourFont',
        //  defaultFontSize:14
      };

      if (config.defaultColor) {
        defaultFontpayload.global["defaultColor"] = config.defaultColor;
        defaults = true;
      }
      if (config.defaultFontColor) {
        defaultFontpayload.global["defaultFontColor"] = config.defaultFontColor;
        defaults = true;
      }
      if (config.defaultFontName) {
        defaultFontpayload.global["defaultFontFamily"] = config.defaultFontName;
        defaults = true;
      }
      if (config.defaultFontSize) {
        defaultFontpayload.global["defaultFontSize"] = config.defaultFontSize;
        defaults = true;
      }
      if (defaults) {
        // chartOptions['defaults']= defaultFontInfo
      }
      // chart title

      if (config.titleFontFamily != undefined)
        chartOptions.title.fontFamily = config.titleFontFamily;
      if (config.titleFontSize != undefined)
        chartOptions.title.fontSize = config.titleFontSize;
      if (config.titleFontStyle != undefined)
        chartOptions.title.fontStyle = config.titleFontStyle;
      if (config.chartTitleColor)
        chartOptions.title.fontColor = config.chartTitleColor;

      // chart legend

      if (config.legendFontFamily != undefined)
        chartOptions.legend.fontFamily = config.legendFontFamily;
      if (config.legendFontSize != undefined)
        chartOptions.legend.fontSize = config.legendFontSize;
      if (config.legendFontStyle != undefined)
        chartOptions.legend.fontStyle = config.legendFontStyle;
      if (config.legendTextColor) {
        var labels = { fontColor: config.legendTextColor };
        chartOptions.legend["labels"] = Object.assign(
          chartOptions.legend["labels"],
          labels
        );
      }

      // xAxes label

      if (config.xAxisLabelColor != undefined)
        chartOptions.scales.xAxes[0].scaleLabel.fontColor =
          config.xAxisLabelColor;
      if (config.xAxisLabelFontFamily != undefined)
        chartOptions.scales.xAxes[0].scaleLabel.fontFamily =
          config.xAxisLabelFontFamily;
      if (config.xAxisLabelFontSize != undefined)
        chartOptions.scales.xAxes[0].scaleLabel.fontSize =
          config.xAxisLabelFontSize;
      if (config.xAxisLabelFontStyle != undefined)
        chartOptions.scales.xAxes[0].scaleLabel.fontStyle =
          config.xAxisLabelFontStyle;

      // xAxes ticks

      if (config.xAxisTickLabelColor != undefined)
        chartOptions.scales.xAxes[0].ticks.fontColor =
          config.xAxisTickLabelColor;
      if (config.xAxisTickLabelFontFamily != undefined)
        chartOptions.scales.xAxes[0].ticks.fontFamily =
          config.xAxisTickLabelFontFamily;
      if (config.xAxisTickLabelFontSize != undefined)
        chartOptions.scales.xAxes[0].ticks.fontSize =
          config.xAxisTickLabelFontSize;
      if (config.xAxisTickLabelFontStyle != undefined)
        chartOptions.scales.xAxes[0].ticks.fontStyle =
          config.xAxisTickLabelFontStyle;

      // yAxes label

      if (config.yAxisLabelColor != undefined)
        chartOptions.scales.yAxes[0].scaleLabel.fontColor =
          config.yAxisLabelColor;
      if (config.yAxisLabelFontFamily != undefined)
        chartOptions.scales.yAxes[0].scaleLabel.fontFamily =
          config.yAxisLabelFontFamily;
      if (config.yAxisLabelFontSize != undefined)
        chartOptions.scales.yAxes[0].scaleLabel.fontSize =
          config.yAxisLabelFontSize;
      if (config.yAxisLabelFontStyle != undefined)
        chartOptions.scales.yAxes[0].scaleLabel.fontStyle =
          config.yAxisLabelFontStyle;

      //yAxes ticks

      if (config.yAxisTickColor != undefined)
        chartOptions.scales.yAxes[0].ticks.fontColor = config.yAxisTicklColor;
      if (config.yAxisTickFontFamily != undefined)
        chartOptions.scales.yAxes[0].ticks.fontFamily =
          config.yAxisTickFontFamily;
      if (config.yAxisTickFontSize != undefined)
        chartOptions.scales.yAxes[0].ticks.fontSize = config.yAxisTickFontSize;
      if (config.yAxisTickFontStyle != undefined)
        chartOptions.scales.yAxes[0].ticks.fontStyle =
          config.yAxisTickFontStyle;
    }
    function setTimerForNextRefresh(payload, offset, type) {
      var next_time = 0;

      if (type == "hours") {
        payload.config.usePreviousFile = false;
        next_time = moment().endOf("day").add(offset, type);
      } else {
        payload.config.usePreviousFile = true;
        next_time = moment().add(offset, type);
      }
      // if(self.config.debug)
      let millis = next_time.diff(moment());
      if (_chart_debug) console.log(payload.id + " timeout diff =" + millis);
      if (timeout_handle[payload.id]) {
        if (_chart_debug) console.log(payload.id + " clearing timer");
        clearTimeout(timeout_handle[payload.id]);
      }
      if (_chart_debug) console.log(payload.id + " starting timer");
      timeout_handle[payload.id] = setTimeout(() => {
        refreshData(payload);
      }, millis); // next_time.diff(moment()));
      if (_chart_debug) console.log(payload.id + " timer started");
    }
  });
