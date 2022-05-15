const MODEL_PATH = './tfjs_models/model/model.json';

const CONFIDENCE_THRESHOLD_SCORE = 0.30;

// EfficientDet d0 (recent model)
const INPUT_IMAGE_SIZE = 512;
const BOX_PARAM_INDEX = 2;
const CLASS_PARAM_INDEX = 3;
const SCORE_PARAM_INDEX = 4;

// Define our labelmap
const labelMap = {
    1: { name: 'article', color: 'turquoise' },
    2: { name: 'chat-panel', color: 'lime' },
    3: { name: 'comments', color: 'green' },
    4: { name: 'contentsummary', color: 'purple'},
    5: { name: 'tool-bar', color: 'blue' },
    6: { name: 'form', color: 'aqua' },
    7: { name: 'content-grid', color: 'fuchsia' },
    8: { name: 'content-list', color: 'lime' },
    9: { name: 'login', color: 'yellow' },
    10: { name: 'media', color: 'chocolate' },
    11: { name: 'menu-bar', color: 'cyan' },
    12: { name: 'menu-panel', color: 'greenyellow' },
    13: { name: 'options-panel', color: 'peru' },
    14: { name: 'posts', color: 'tomato' },
    15: { name: 'search', color: 'orange' },
    16: { name: 'side-panel', color: 'darkgreen' },
    17: { name: 'tab-bar', color: 'red' }
}

class TfjsProcessor {

    constructor() {
        // tf.setBackend('webgl');
        this.loadModel();
    }

    async loadModel() {
        console.log('Loading model...');
        const startTime = performance.now();

        this.model = await tf.loadGraphModel(MODEL_PATH); // load the model

        const totalTime = Math.floor(performance.now() - startTime);
        console.log(`Model loaded and initialized in ${totalTime}ms...`);
        console.log('Current backend is running on ' + tf.getBackend());
    }

    async loadImage(dataURL) {
        return new Promise(resolve => {
            var img = document.createElement('img');
            img.crossOrigin = "anonymous";
            img.onerror = function (e) {
                resolve(null);
            };
            img.onload = function (e) {
                if ((img.height && img.height > 128) || (img.width && img.width > 128)) {
                    resolve(img);
                }
                // Let's skip all tiny images
                resolve(null);
            }
            img.src = dataURL;
        });
    }

    async predict(dataURL) {
        console.log('Predicting..');
        const imgElement = await this.loadImage(dataURL);
        // const startTime = performance.now();

        // Original image size
        const screen_width = imgElement.width;
        const screen_height = imgElement.height;

        // Set image size for tf input
        imgElement.width = INPUT_IMAGE_SIZE;
        imgElement.height = INPUT_IMAGE_SIZE;
        
        tf.engine().startScope();
        const tfimg = await tf.browser.fromPixels(imgElement).toInt();
        // tf.image.resizeBilinear(tfimg, [INPUT_IMAGE_SIZE, INPUT_IMAGE_SIZE], true, false).print();
        const batched = await tfimg.transpose([0, 1, 2]).expandDims();
        const outputs = await this.model.executeAsync(batched);

        // Detection parameters      
        const boxes = (outputs[BOX_PARAM_INDEX].arraySync())[0];
        const classes = (outputs[CLASS_PARAM_INDEX].arraySync())[0];
        const scores = (outputs[SCORE_PARAM_INDEX].arraySync())[0];

        const threshold = CONFIDENCE_THRESHOLD_SCORE; // confidence score threshold

        let detections = [];
        for (let i = 0; i <= scores.length; i++) { // score array is already sorted
            if (scores[i] < threshold) {
                break;
            }

            // Extract variables
            const [ymin, xmin, ymax, xmax] = boxes[i];
            const class_num = classes[i];
            const name = labelMap[class_num].name;
            const color = labelMap[class_num].color;
            const score = scores[i];

            // store predicted boxes information
            const pred = {
                name: name,
                score: score,
                color: color,
                xmin: xmin * screen_width,
                xmax: xmax * screen_width,
                ymin: ymin * screen_height,
                ymax: ymax * screen_height
            }
            detections.push(pred);
            // console.log(i + "th prediction: ", pred);
        }

        tf.engine().endScope();

        return {
            detections: detections,
            screen_width: screen_width,
            screen_height: screen_height
        }
    }
}

const devtoolsHandler = (function () {
    protocolVersion = "1.3" // ??
    documentRootId = null; // CDP document root node id

    function attach_debugger(tabId) {
        return new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId: tabId }, protocolVersion, function () {
                if (chrome.runtime.lastError) {
                    console.log("[CDP] attach error: " + chrome.runtime.lastError.message);
                    return reject();
                }
                resolve();
            });
        });
    }

    function exec(tabId, command) {
        return new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId: tabId }, command, function (res) {
                if (chrome.runtime.lastError) {
                    console.log('[CDP] exec error:', command, chrome.runtime.lastError.message);
                    return reject();
                }

                console.log('[CDP] exec command:', command);
                resolve(res);
            });
        });
    }

    function exec_params(tabId, command, params) {
        return new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId: tabId }, command, params, function (res) {
                if (chrome.runtime.lastError) {
                    console.log('[CDP] exec error:', command, chrome.runtime.lastError.message);
                    return reject();
                }

                console.log('[CDP] exec command:', command);
                setTimeout(function () {
                    resolve(res);
                }, 300);
                
            });
        });
    }

    return {
        attach: function (tabId) {

            attach_debugger(tabId);

            chrome.debugger.onDetach.addListener((debuggee, reason) => {
                console.log("[CDP] Detached", debuggee.tabId, reason);
            });
        },

        // Request from tabs
        requestHandler: async function (tabId, params) {

            attach_debugger(tabId);

            const request = params.request;
            switch (request) {

                case "dispatchPointClick": {
                    const coordinates = params.coordinates;

                    await exec_params(tabId, 'Input.dispatchMouseEvent', {
                        type: "mousePressed",
                        x: coordinates.x,
                        y: coordinates.y,
                        button: "left",
                        clickCount: 1
                    });

                    await exec_params(tabId, 'Input.dispatchMouseEvent', {
                        type: "mouseReleased",
                        x: coordinates.x,
                        y: coordinates.y,
                        button: "left",
                        clickCount: 1
                    });

                    break;
                }

                case "dispatchTextInput": {
                    const text = params.text;
                    for (var i = 0; i < text.length; i++) {
                        await exec_params(tabId, 'Input.dispatchKeyEvent', {
                            type: 'char',
                            text: text.charAt(i)
                        });
                    }
                    break;
                }

                case "dispatchEnterInput": {
                    await exec_params(tabId, 'Input.dispatchKeyEvent', {
                        type: 'char',
                        text: '\r',
                        unmodifiedText: '\r'
                    });
                    break;
                }
            }
        }
    }
})();

let cur_imageDataURL = null;
let cur_tabId = null;
let cur_detections = null;
let cur_segments = null;
let hostname = null;

const tfjsProcessor = new TfjsProcessor();

/**
 * @onLayoutParsed
 * 
 * @param {*} tabId
 * @param {*} segments
 */
function onScreenParsed(screen_width, screen_height, detections, segments, url, hostname) {
    cur_segments = segments;
    console.log("parsed segments", segments);
}

/**
 * @Detection on local browser
 */
async function screenParseRequested(tabId) {

    // From screenshot to predicted objects
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 100 }, async function (dataURI) {
        // checkImageSimilarity(dataURI);
        const detectionResults = await tfjsProcessor.predict(dataURI); // local browser prediction

        const detections = detectionResults.detections;
        cur_detections = detections;

        const screen_width = detectionResults.screen_width;
        const screen_height = detectionResults.screen_height;

        chrome.tabs.sendMessage(tabId, {
            method: "startParse",
            params: {
                detections: detections,
                screen_width: screen_width,
                screen_height: screen_height
            }
        });

        // Store session states
        cur_tabId = tabId;
        cur_imageDataURL = dataURI;

        return true;
    });
}

// Render detection results to new tab
function renderParseResults() {
    console.log(getSessionState());

    chrome.tabs.create({
        url: chrome.extension.getURL('popup_detection_result.html')
        // url: url
    }, function (tab) {
        chrome.tabs.create({
            url: chrome.extension.getURL('popup_parsed_result.html')
            // url: url
        }, function (tab) {
    
        });
    });
}

/**
 * @function checkImageSimilarity
 * Calc similarity b.t.w. two screenshot
 * 
 * @Requirement Add "library/pixelmatch.js" to background script list on manifest.json
 */
let previous_dataURI = null;
function checkImageSimilarity(current_dataURI) {

    function convertURIToImageData(URI) {
        return new Promise(function (resolve, reject) {
            if (URI == null) return reject();
            let canvas = document.createElement('canvas'),
                context = canvas.getContext('2d'),
                image = new Image();
            image.addEventListener('load', function () {
                canvas.width = image.width;
                canvas.height = image.height;
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const width = image.width;
                const height = image.height;
                resolve({imageData: imageData, width: width, height: height});
            }, false);
            image.src = URI;
        });
    }

    if (!previous_dataURI) previous_dataURI = current_dataURI;
    else {
        convertURIToImageData(previous_dataURI).then(function (_obj) {
            const img1 = _obj.imageData, width = _obj.width, height = _obj.height;
            convertURIToImageData(current_dataURI).then(function (obj) {
                const img2 = obj.imageData;

                let canvas = document.createElement('canvas'), diffContext = canvas.getContext('2d');
                const diff = diffContext.createImageData(width, height);

                // Threshold 조정!
                const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.9 });

                // Diff percentage로 치환!
                console.log("numDiffPixels", numDiffPixels);

                previous_dataURI = current_dataURI;
            });
        });
    }
}

/**
 * @Communication_channels_with_other_contexts
 * 1. content script
 * 2. popup script
 */
 chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.highlighted == true) {

        console.log("Tab updated", tabId, changeInfo, tab);

        devtoolsHandler.attach(tabId);
    }
});
let cur_url = null;
let onrender_time_sum = 0;
let onrender_cnt = 0;

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {

        console.log("runtime message to background", request.method);
        const tabId = sender.tab.id;

        switch (request.method) {
            case "pageInitiallyLoaded": {
                break;
            }

            case "requestScreenParse": {
                screenParseRequested(tabId);
                break;
            }

            case "BackPageDetection": {
                // startDetection(tabId, data, -1);
                break;
            }

            case "screenParsed": { // set segmentation results
                const params = request.params;
                
                onScreenParsed(params.screen_width, params.screen_height, params.detections, params.segments, params.url, params.hostname);

                // 임시로 그린거 보여주기
                renderParseResults();
                break;
            }

            case "devtoolsProtocol": {
                devtoolsHandler.requestHandler(tabId, request.params);
                break;
            }
        }

        return true;
    }
);

// Send "popup" script a background state
function getSessionState() {
    // return current background session states
    return {
        activeTabId: cur_tabId,
        imageDataURL: cur_imageDataURL,
        GUI_segments: cur_segments,
        original_detections: cur_detections
    }
}

let portToPopup = null;

chrome.runtime.onConnect.addListener(function (port) {
    portToPopup = port;
    // console.log("port to popup opened!");

    portToPopup.onMessage.addListener(function (msg) {

    });

    portToPopup.onDisconnect.addListener(function () {
        // console.log("port to popup closed!");

        portToPopup = null;
    });
});