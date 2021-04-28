import {setImageSrcBitmap, toBase64} from "./util.js";

//ons.platform.select('android');
let file = null;
let ws = null;

//On initialization.
document.addEventListener('init', function(event) {
  handleNavigation(event);
});

function sendFile(imgData) {
  if(ws != null && ws.readyState === WebSocket.OPEN) {
    const dataToSend = {action: 'startNewAnalysis', data: {image: imgData}};
    ws.send(JSON.stringify(dataToSend));

    ons.notification.toast("Data was sent to server.", { timeout: 4000 });
  }
  else {
    if(ws != null) {
        ws.close();
    }

    initWebSocket(function() {
        sendFile(imgData);
    });
  }
}
function onFacesFound(topicData) {
  setImageSrcBitmap("#img-evaluation-fd",topicData.image_with_boxes);
}

function onEmotionRecognized(topicData) {
  const listItem = createSimpleListItem(topicData.image_cut_out,topicData.emotion);
  document.querySelector("#list-evaluation-er").appendChild(listItem);
}

function onFaceIdentified(topicData) {
  const listItem = createSimpleListItem(topicData.image_cut_out,topicData.name);
  document.querySelector("#list-evaluation-fi").appendChild(listItem);
}

function initWebSocket(onInitializedCallback) {
  ws = new WebSocket("ws://" + window.location.host + "/websockets");

  ws.onopen = function() {
    if(onInitializedCallback) {
        onInitializedCallback();
    }

    console.log("Websockets status changed to: " + ws.readyState);
  }

  ws.onmessage = function(message) {
    console.log(message.data);
    const recData = JSON.parse(message.data);

    if(recData.action === "onAnalysisFailed") {
        ons.notification.alert("Analysis failed! Cause: " + recData.data.error);
    }
    else if(recData.action === "onAnalysisUpdate") {
        ons.notification.toast("Analysis update: " + recData.data.status + ".", { timeout: 4000 });
    }
    else if(recData.action === "onAnalysisResult") {
        switch (recData.data.topicName) {
          case "faces_found":
            onFacesFound(recData.data.topicData);
            break;
          case "gui-response_emotion":
            onEmotionRecognized(recData.data.topicData);
            break;
          case "gui-response_face":
            onFaceIdentified(recData.data.topicData);
            break;
          default:
            console.log(`Other data was found: ${recData}`);
        }
    }
    else {
        console.log("Other data was found:");
        console.log(recData);
    }

    /*
    * On consumer update:
      action: "onAnalysisResult",
      data: {
        topicName: string,
        topicData: JSON-object
      }
    *
    * */
  }

  ws.onerror = function(error) {
    ws.close();
    onAnalysisFailed();

    ons.notification.alert("Websockets connection was lost! Cause: " + error);
    console.log("A websockets error occurred: " + error);
  }
}

function onAnalysisFailed() {
    //TODO: Reset image and return to the initial page.
}

function handleNavigation(event){
  const page = event.target;
  const navigator = document.querySelector('#myNavigator');

  if (page.id === 'page-send') {
    page.querySelector('#btn-send-picture').onclick = function() {
      if(!isValidFile()){
        ons.notification.alert("Error: Invalid File type! Please use a Jpeg,Png,Bmp or Gif File!")
      }
      else{
        toBase64(file).catch(er => ons.notification.alert(er)).then(it => {
          sendFile(it);
          navigator.pushPage('page-evaluation.html', {data: {title: 'Evaluation'}});
        });
      }
    };

    /*page.querySelector('#btn-send-picture').onclick = function() {
      document.querySelector('#myNavigator').pushPage('page-process.html', {data: {title: 'Processing'}});
    };*/

    page.querySelector("#file-input").onchange = function(e) {
      const output = document.querySelector("#img-send-preview");
      let fileList = e.target.files;
      for(let i = 0; i < fileList.length; i++) {
        if(fileList[i].type.match(/^image\//)) {
          file = fileList[i];
          break;
        }
      }
      if(file !== null) {
        output.src = URL.createObjectURL(file);
      }
    }
  }
  else if (page.id === 'page-process') {
    page.querySelector('ons-toolbar .center').innerHTML = page.data.title;
  }
  else if (page.id === 'page-evaluation') {
    page.querySelector('ons-toolbar .center').innerHTML = page.data.title;
    page.querySelector('#btn-finish').onclick = function () {
      navigator.resetToPage('page-send.html');
    };
  }
}

function isValidFile(){
  console.log(file);
  const validTypes = document.querySelector("#file-input").accept.split(/,[ ]*/);
  return file != null && validTypes.includes(file.type);
}

function createSimpleListItem(img64, title){
  const liElement = document.createElement("li");
  liElement.className="img-eval-list-item";

  const itemDescription = document.createElement("p");
  itemDescription.innerHTML = title;

  const itemImg = document.createElement("img");
  itemImg.src = `data:image;base64,${img64}`;
  itemImg.className = "eval-picture";

  liElement.appendChild(itemImg);
  liElement.appendChild(itemDescription);
  /*

  <li class="img-eval-list-item">
              <img src="./img/InProgress.svg" />
              <p>Lorem ipsum</p>
            </li>
  * */
  return liElement;
}
