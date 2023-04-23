const STATUS 										= document.getElementById('status');
const VIDEO 										= document.getElementById('webcam');
const RESET_BUTTON 							= document.getElementById('reset');
const TRAIN_BUTTON 							= document.getElementById('train');
const IFEMODEL_LOADWEB_BUTTON 	= document.getElementById('ifeModel_loadWeb');
const IFEMODEL_LOADLOCAL_BUTTON = document.getElementById('ifeModel_loadLocal');
const CMODEL_CREATE_BUTTON 			= document.getElementById('cModel_create');
const CMODEL_LOAD_BUTTON 				= document.getElementById('cModel_load');
const CMODEL_SAVE_BUTTON 				= document.getElementById('cModel_save');
const IMAGEDATA_LOAD_BUTTON 		= document.getElementById('imageData_load');
const IMAGEDATA_SAVE_BUTTON 		= document.getElementById('imageData_save');
const IFEMODEL_INPUT 						= document.getElementById('ifeModel_input');
const CMODEL_INPUT 							= document.getElementById('cModel_input');
const IMAGEDATA_INPUT 					= document.getElementById('imageData_input');
const MOBILE_NET_INPUT_WIDTH 		= 224;
const MOBILE_NET_INPUT_HEIGHT 	= 224;
const STOP_DATA_GATHER 					= -1;
const CLASS_NAMES 							= [];

TRAIN_BUTTON.addEventListener('click', train);
RESET_BUTTON.addEventListener('click', reset);
IFEMODEL_LOADWEB_BUTTON.addEventListener('click', ifeModel_loadWeb);
IFEMODEL_LOADLOCAL_BUTTON.addEventListener('click', ifeModel_loadLocal);
CMODEL_CREATE_BUTTON.addEventListener('click', cModel_create);
CMODEL_LOAD_BUTTON.addEventListener('click', cModel_load);
CMODEL_SAVE_BUTTON.addEventListener('click', cModel_save);
IMAGEDATA_LOAD_BUTTON.addEventListener('click', imageData_load);
IMAGEDATA_SAVE_BUTTON.addEventListener('click', imageData_save);

let ifeModel 						= undefined;
let cModel							= undefined;
let gatherDataState 		= STOP_DATA_GATHER;
let videoPlaying 				= false;
let predict 						= false;
let imagesDataToSave		= [];
let trainingDataInputs	= [];
let trainingDataOutputs = [];
let examplesCount 			= [];


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//MQTT configuration
const url = 'wss://broker.emqx.io:8084/mqtt';
const options = {
  clean: true,
  connectTimeout: 4000,
  clientId: 'SRP_smartphone',
};

const client = mqtt.connect(url, options);

client.on('connect', function () {
  console.log('MQTT Connected!');
  client.subscribe( 'SRP_topic' );
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Create handling of dataCollectorButtons
let dataCollectorButtons = document.querySelectorAll('button.dataCollector');

for (let i = 0; i < dataCollectorButtons.length; i++) {
  dataCollectorButtons[i].addEventListener('mousedown', gatherDataForClass);
  dataCollectorButtons[i].addEventListener('mouseup', gatherDataForClass);
 
  //Create class names tab
  CLASS_NAMES.push(dataCollectorButtons[i].getAttribute('data-name'));
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Load image features extraction model from web - button handler
async function ifeModel_loadWeb() {
	STATUS.innerText = 'Features model is loading from web ...';
  const URL = 'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v3_small_100_224/feature_vector/5/default/1';
  ifeModel = await tf.loadGraphModel(URL, {fromTFHub: true});
  STATUS.innerText = 'Features model loaded successfully!';
  
  // Warm up the model by passing zeros through it once.
  tf.tidy(function () {
    let answer = ifeModel.predict(tf.zeros([1, MOBILE_NET_INPUT_HEIGHT, MOBILE_NET_INPUT_WIDTH, 3]));
    console.log(answer.shape);
  });
  
  IFEMODEL_LOADWEB_BUTTON.classList.add('removed');
  IFEMODEL_LOADLOCAL_BUTTON.classList.add('removed');
  //Save this ifeModel on local
  await ifeModel.save( 'downloads://ifeModel' );
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Load image features extraction model from local - button handler
async function ifeModel_loadLocal(){
	STATUS.innerText = 'Features model is loading from local ...';
	ifeModel = await tf.loadGraphModel( tf.io.browserFiles( [IFEMODEL_INPUT.files[0], IFEMODEL_INPUT.files[1]] ));
	//ifeModel = await tf.loadGraphModel( 'indexeddb://ifeModel_1' );
  STATUS.innerText = 'Features model loaded successfully!';
	
	// Warm up the model by passing zeros through it once.
  tf.tidy(function () {
    let answer = ifeModel.predict(tf.zeros([1, MOBILE_NET_INPUT_HEIGHT, MOBILE_NET_INPUT_WIDTH, 3]));
    console.log(answer.shape);
  });
  
  IFEMODEL_LOADWEB_BUTTON.classList.add('removed');
  IFEMODEL_LOADLOCAL_BUTTON.classList.add('removed');
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Create new classification model - button handler
function cModel_create(){
	if( ifeModel == undefined ) return;

	cModel = tf.sequential();
	cModel.add(tf.layers.dense({inputShape: [1024], units: 128, activation: 'relu'}));				//mobileNet v1 and v3: 1024, v2: 1280
	cModel.add(tf.layers.dense({units: CLASS_NAMES.length, activation: 'softmax'}));
	cModel.summary();
	
	// Compile the cModel with the defined optimizer and specify a loss function to use.
	cModel.compile({
  	// Adam changes the learning rate over time which is useful.
  	optimizer: 'adam',
  	// Use the correct loss function. If 2 classes of data, must use binaryCrossentropy.
  	// Else categoricalCrossentropy is used if more than 2 classes.
  	loss: (CLASS_NAMES.length === 2) ? 'binaryCrossentropy': 'categoricalCrossentropy', 
  	// As this is a classification problem you can record accuracy in the logs too!
  	metrics: ['accuracy']  
	});
	
	//Enable video camera to get ability gathering image data
	enableCam();
	STATUS.innerText = 'Start gathering training data';
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Load classification model from local - button handler
async function cModel_load(){
	if( ifeModel == undefined ) return;

	STATUS.innerText = 'Classification model is loading from local ...';
	cModel = await tf.loadLayersModel( tf.io.browserFiles( [CMODEL_INPUT.files[0], CMODEL_INPUT.files[1]] ) );
	
	//Enable video camera
	enableCam();
	//Wait 1s for loading video, then begin predicting
	predict = true;
	setTimeout( function(){ predictLoop(); }, 1000);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Enable Webcam
function enableCam() {
  if( hasGetUserMedia() ) {
    // getUsermedia parameters.
    const constraints = {
      video:  true,
      width:  640, 
      height: 480,
      "video": {
        "facingMode": 
          { "ideal": "environment" }
      }
    };

    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
      VIDEO.srcObject = stream;
      VIDEO.addEventListener('loadeddata', function() {
        videoPlaying = true;
      });
    });
  }else{
    console.warn('getUserMedia() is not supported by your browser');
  }
}

function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Save classification model - button handler
async function cModel_save(){
	if( !predict ) return;
	
	await cModel.save( 'downloads://cModel' );
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Load image data - button handler
async function imageData_load(){
	if( (cModel == undefined) || predict ) return;	
	
	let savedData_asText = await readFile( IMAGEDATA_INPUT.files[0] );
	let savedData = JSON.parse( savedData_asText );
	console.log( savedData );
	
	reset();
	trainingDataOutputs = savedData.trainingDataOutputs;
	
	for( let j = 0; j < trainingDataOutputs.length; j++ ){
		//convert array to tensor data
		let resizedTensorFrame 		= tf.tensor( savedData.imagesDataToSave_asArray[ j ] );
		let normalizedTensorFrame = resizedTensorFrame.div(255);
		//extract image features with currently chosen ifeModel
		let imageFeatures = ifeModel.predict( normalizedTensorFrame.expandDims() ).squeeze();
		
		imagesDataToSave.push( resizedTensorFrame );
		trainingDataInputs.push( imageFeatures );
		
		//set correct values of examplesCount
		if( examplesCount[ trainingDataOutputs[j] ] === undefined ){
    	examplesCount[ trainingDataOutputs[j] ] = 0;
  	}
  	examplesCount[ trainingDataOutputs[j] ]++;
	}

  STATUS.innerText = '';
  for (let n = 0; n < CLASS_NAMES.length; n++) {
    STATUS.innerText += CLASS_NAMES[n] + ':' + examplesCount[n] + '   . ';
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Save image data - button handler
async function imageData_save(){
	if( cModel == undefined ) return;
	
	//convert tensor data to array
	let imagesDataToSave_asArray = [];
	let tensor;
	
	for( let j = 0; j < trainingDataOutputs.length; j++ ){
		tensor = imagesDataToSave[ j ];
		imagesDataToSave_asArray.push( tensor.arraySync() );
	}
	
	let dataToSave = { trainingDataOutputs, imagesDataToSave_asArray };
	saveFile( dataToSave );
	
	STATUS.innerText = 'Training image data saved!';
	console.log( dataToSave );
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Read/save data to file functions
// Read file content function (return string)
async function readFile( file ){
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = () => {
        resolve(reader.result);
    };
    reader.readAsText(file);
  });
};

// Save data to json file function (parameter is variable)
function saveFile( data ){
	let a = document.createElement("a");
  a.href = URL.createObjectURL( new Blob([JSON.stringify( data )], {type: "application/json"}) );
  a.setAttribute("download", "data");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Gathering function
function gatherDataForClass() {
  let classNumber = parseInt(this.getAttribute('data-1hot'));
  gatherDataState = (gatherDataState === STOP_DATA_GATHER) ? classNumber : STOP_DATA_GATHER;
  
  dataGatherLoop();
}

function dataGatherLoop() {
  if (videoPlaying && gatherDataState !== STOP_DATA_GATHER) {
  	//get currently video frame from camera
    let videoFrameAsTensor = tf.browser.fromPixels(VIDEO);
    let resizedTensorFrame = tf.image.resizeBilinear(videoFrameAsTensor, [MOBILE_NET_INPUT_HEIGHT, 
        MOBILE_NET_INPUT_WIDTH], true);
    let normalizedTensorFrame = resizedTensorFrame.div(255);
    //extract image features
    let imageFeatures = ifeModel.predict( normalizedTensorFrame.expandDims() ).squeeze();
    
    //save data to arrays
		imagesDataToSave.push( resizedTensorFrame );
    trainingDataInputs.push( imageFeatures );
    trainingDataOutputs.push( gatherDataState );
    
    // Intialize array index element if currently undefined.
    if (examplesCount[gatherDataState] === undefined) {
      examplesCount[gatherDataState] = 0;
    }
    examplesCount[gatherDataState]++;

    STATUS.innerText = '';
    for (let n = 0; n < CLASS_NAMES.length; n++) {
      STATUS.innerText += CLASS_NAMES[n] + ':' + examplesCount[n] + '   . ';
    }
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Train button handler
async function train(){
	STATUS.innerText = 'Training in progress ...';

  predict = false;
  tf.util.shuffleCombo(trainingDataInputs, trainingDataOutputs);
  let outputsAsTensor = tf.tensor1d(trainingDataOutputs, 'int32');
  let oneHotOutputs 	= tf.oneHot(outputsAsTensor, CLASS_NAMES.length);
  let inputsAsTensor 	= tf.stack(trainingDataInputs);
  
  let results = await cModel.fit(inputsAsTensor, oneHotOutputs, {shuffle: true, batchSize: 5, epochs: 10, 
      callbacks: {onEpochEnd: logProgress} });
  
  outputsAsTensor.dispose();
  oneHotOutputs.dispose();
  inputsAsTensor.dispose();
  
  predict = true;
  predictLoop();
}

function logProgress(epoch, logs) {
  console.log('Data for epoch ' + epoch, logs);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Predicting function
function predictLoop() {
  if (predict) {
    tf.tidy(function() {
      let videoFrameAsTensor = tf.browser.fromPixels(VIDEO).div(255);
      let resizedTensorFrame = tf.image.resizeBilinear(videoFrameAsTensor,
      [MOBILE_NET_INPUT_HEIGHT, MOBILE_NET_INPUT_WIDTH], true);

      let imageFeatures = ifeModel.predict(resizedTensorFrame.expandDims());
      let prediction = cModel.predict(imageFeatures).squeeze();
      let highestIndex = prediction.argMax().arraySync();
      let predictionArray = prediction.arraySync();

      STATUS.innerText = 'Prediction: ' + CLASS_NAMES[highestIndex] + ' with '
      + Math.floor(predictionArray[highestIndex] * 100) + '% confidence';
      
      
      //send sign code to Arduino
      if( predictionArray[ highestIndex ] >= 0.97 ){
      	switch( highestIndex ){
      		case 0:		client.publish( 'SRP_topic', 's' );	break;
      		case 1:		client.publish( 'SRP_topic', 'f' );	break;
      		case 2:		client.publish( 'SRP_topic', 'l' );	break;
      		case 3:		client.publish( 'SRP_topic', 'r' );	break;
      		case 4:		client.publish( 'SRP_topic', 't' );	break;
      	}
      }
    });

    window.requestAnimationFrame(predictLoop);
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Reset button handler
// Purge data and start over. Note this does not dispose of the loaded ifeModel and MLP head tensors
// as you will need to reuse them to train a new cModel.
function reset() {
  predict = false;
  examplesCount.length = 0;
  
  for (let i = 0; i < trainingDataInputs.length; i++) {
    imagesDataToSave[i].dispose();
    trainingDataInputs[i].dispose();
  }
  
  imagesDataToSave.length = 0;
  trainingDataInputs.length = 0;
  trainingDataOutputs.length = 0;
  
  STATUS.innerText = 'No data collected';
  console.log('Tensors in memory: ' + tf.memory().numTensors);
}



