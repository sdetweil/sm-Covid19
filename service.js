const path=require('path')
const sfn=document.currentScript.src.substring(7,document.currentScript.src.lastIndexOf(path.sep))
const _chart_debug=true
const cvt=require(path.resolve(sfn ,"node_modules",'csvtojson'));

angular.module("SmartMirror")
	.factory("_MyChartService", 
		function ($http) {
			var service={}
			service.getUrl=geturl

			console.log("MyCovid19 service up and running")
			var waiting={'countries':[], 'states':[]}
			const statesurl = "https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv"
			const countriesurl ="https://opendata.ecdc.europa.eu/covid19/casedistribution/csv"
    	const countryfields=['date','cases','deaths','countries','geoid']
      const statefields=['date','state','cases','deaths']
			function geturl(){
				return countriesurl
			}


			function getInitialData( payload) {

				return new Promise( 
					(resolve,reject) =>{

						var xf=sfn+path.sep+payload.config.type+"-rawdata"+"-"+moment().format("MM-DD-YYYY")+'.csv'
						if(fs.existsSync(xf)){
							if(_chart_debug)
								console.log("requested file exists="+xf+" sending back to "+payload.id)
							// send it back
							cvt().fromFile(xf)  // input xls
								.then((result) =>{
									resolve( {data:result,payload:payload})                 
								}
								)
						}
						else{
							if(_chart_debug)
								console.log("requested file does NOT exist "+payload.id)        
							// if we are not waiting
							var found=false;
							for(var p of waiting[payload.config.type]){
								if(p.id == payload.id){
									found=true
									break;
								}
							}

							if(found==false){
								if(_chart_debug)
									console.log("not on the list to be waiting, adding "+payload.id)
								// say we are
								payload.resolve=resolve
								payload.reject=reject
								waiting[payload.config.type].push(payload)
							}
							else  {
								// already waiting?
								if(_chart_debug)
									console.log("already waiting "+payload.id)
							}

							// if we are the first
							if(waiting[payload.config.type].length==1){

								if(_chart_debug)
									console.log("first to be waiting "+payload.id)
				
								// send request to get file
								$http.get(payload.config.type=='countries'?countriesurl:statesurl)
									.then (
										(response) =>{
					
	
											//console.log("url="+texturl)      
											//	if(true) {
											//if(_chart_debug)
											//  console.log("have data")
											fs.writeFile(xf,response.data, (error)=>{
												if(!error){
													cvt().fromFile(xf)  // input xls
														.then((result) =>{
															// send the response to all waiters
															for(var p of waiting[payload.config.type]){
																if(_chart_debug)
																	console.log("resolving for id="+p.id)
																p.resolve({data:result, payload:p})                  
															}
															// clear the waiting list
															waiting[payload.config.type]=[]
															// get yesterdays filename
															var xf1=sfn+path.sep+payload.config.type+"-rawdata"+"-"+moment().subtract(1,'days').format("MM-DD-YYYY")+'.csv'
															// if it exists
															if(fs.existsSync(xf1)){                        
																// erase it
																fs.unlink(xf1, () => {
																	if(_chart_debug)
																		console.log("erased old file ="+xf1)
																})
															}  
														}
														)
												}
												else {
													if(_chart_debug)
														console.log("file write error id="+p.id)
													for(var p of waiting[payload.config.type]){
														if(_chart_debug)
															console.log("rejecting file write for id="+p.id) 
														p.reject({result:null, payload:p, error:error})    
													}
													// clear the waiting list
													waiting[payload.config.type]=[]                   
												}
											})         
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
										}
									)
									.catch(
										(error)=>{
											console.log("get csv failed ="+JSON.stringify(error))
											if(_chart_debug)
												console.log("===>error= id="+payload.id+" "+ JSON.stringify(error));
											for(var p of waiting[payload.config.type]){
												if(_chart_debug)
													console.log("rejecting error for id="+p.id)                  
												p.reject({data:null, payload:p, error:error})     
											}
											// clear the waiting list
											waiting[payload.config.type]=[]                                   
										}
									)
							} else {
								if(_chart_debug)
									console.log("not first waiting "+payload.id)
							}
						}
					} )

			} 

			function unique(list, name, payload) {
				var result = null;
				if(payload.config.debug1)
					console.log("looking for "+name+" in "+JSON.stringify(list))
				list.forEach(function(e) {
					if(e.toLowerCase().indexOf(name.toLowerCase())>=0){               
						result=e;
					}
				});
			
				return result;
			}
			function doGetcountries (init, payload, data) {
				return new Promise((resolve,reject)=>{
		
					if (init==true) {

						// format data keyed by country name
						var   country= {}
						var   state = {}
						var   fields= []
						var fieldNames=Object.keys(data[0]);

						if(payload.config.type=='countries'){      

							for(var f of countryfields){            
								fields.push(unique(fieldNames,f, payload))
							}        
						}
						else{
							for(var  f of statefields){
								fields.push(unique(fieldNames,f, payload))
							}            
						}

						for(var entry of data){
							if(payload.countries!=undefined){
								let v = entry[fields[3]]            
								if(payload.countries.indexOf(v)>=0){
									//console.log(" country geo="+JSON.stringify(entry))
									if(country[v]==undefined){
										country[v]=[]   
									}        
									country[v].push(entry)          
								}
							}
							else{
								let v = entry[fields[1]]
								if(payload.states.indexOf(v)>=0){
									//console.log(" country geo="+JSON.stringify(entry))
									if(state[v]==undefined){
										state[v]=[]   
									}        
									state[v].push(entry) 
								}          
							}
						} 

						var results={}
						if(payload.countries!=undefined ){
							// loop thru all the configured countries 
							for(var c of payload.countries){    
								if( country[c]!=undefined){      
									var totalc=0; var totald=0;
									var cases=[]; var deaths=[];
									var tcases=[]; var tdeaths=[];

									for(var u of country[c]){
										if(payload.config.debug1)
											console.log("date="+u[fields[0]]+" cases="+u[fields[1]]+" deaths="+u[fields[2]]+" geoid="+u[fields[4]])
										// filter out before startDate
										if(payload.startDate==undefined || !moment(u[fields[0]],'DD/MM/YYYY').isBefore(moment(payload.startDate,'YYYY-MM-DD'))){ 
											if(u[fields[0]].endsWith("20")){
												cases.push({ x: moment(u[fields[0]],"DD/MM/YYYY").format('MM/DD/YYYY'), y:parseInt(u[fields[1]])})
												deaths.push({ x: moment(u[fields[0]],"DD/MM/YYYY").format('MM/DD/YYYY'), y:parseInt(u[fields[2]])})
											}
										}
									}
									// data presented in reverse dsate order, flip them
									cases=cases.reverse()
									deaths=deaths.reverse()
									// initialize cumulative counters to 0
									// make a copy
									tcases=JSON.parse(JSON.stringify(cases))
									tdeaths=JSON.parse(JSON.stringify(deaths))
									// loop thru data and create cumulative counters
									for(var i=1 ; i< cases.length; i++){
										tcases[i].y+=tcases[i-1].y;
										tdeaths[i].y+=tdeaths[i-1].y
									}

									var d={'cases':cases, 'deaths':deaths,'cumulative cases':tcases,'cumulative deaths':tdeaths}
									//if(payload.config.debug)
									//  console.log("data returned ="+JSON.stringify(d))
									// add this country to the results
									results[c]=d

								}
							}
						}
						else{
							// loop thru all the configured states
							for(var c of payload.states){    
								if( state[c]!=undefined){      
									var totalc=0; var totald=0;
									var cases=[]; var deaths=[];
									var tcases=[]; var tdeaths=[];
									if(payload.config.debug1)
										console.log("there are "+state[c].length+" entries for state="+c);
									for(var u of state[c]){
										if(payload.config.debug1)
											console.log("date="+u[fields[0]]+" cases="+u[fields[3]]+" deaths="+u[fields[4]])
										// filter out before startDate
										if(payload.startDate==undefined || !moment(u[fields[0]],'YYYY-MM-DD').isBefore(moment(payload.startDate,'YYYY-MM-DD'))){ 
											if(u[fields[0]].startsWith("20")){
												tcases.push({ x: moment(u[fields[0]],"YYYY-MM-DD").format('MM/DD/YYYY'), y:parseInt(u[fields[2]])})
												tdeaths.push({ x: moment(u[fields[0]],"YYYY-MM-DD").format('MM/DD/YYYY'), y:parseInt(u[fields[3]])})
											}
										}
									}
									// initialize cumulative counters to 0
									// make a copy
									cases=JSON.parse(JSON.stringify(tcases))
									deaths=JSON.parse(JSON.stringify(tdeaths))
									// loop thru data and create cumulative counters
									for(var i=cases.length-1;i>0 ;i--){
										cases[i].y-=tcases[i-1].y;
										deaths[i].y-=tdeaths[i-1].y
									}

									var d={'cases':cases, 'deaths':deaths,'cumulative cases':tcases,'cumulative deaths':tdeaths}
									//if(payload.config.debug)
									//  console.log("data returned ="+JSON.stringify(d))
									// add this country to the results
									results[c]=d
								}
							}      
						}
						// send the data on to the display module
						resolve({id:payload.id, config:payload, data:results})
						// sendSocketNotification('Data', {id:payload.id, config:payload.config, data:results})
					}
				})
			}
			function getData(init, payload) {
				return new Promise((resolve,reject)=>{
					if ( init==true) {
						getInitialData(payload) 
							.then( (output) =>{
								//if(payload.config.debug) console.log("data data="+JSON.stringify(data))
								doGetcountries(init, output.payload, output.data)
									.then((data) =>{
										resolve(data)
									})
									.catch((error)=>{
										reject(error)
									})
							})
							.catch((error)=>{            
								console.log("sending no data available notification")
								reject(error)
							});
					}
				})
			}

			service.getData=getData

			return service;  
		} 
	)