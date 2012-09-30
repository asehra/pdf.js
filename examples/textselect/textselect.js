/*
 * This file contains work derived from https://github.com/mozilla/pdf.js/blob/master/web/viewer.css
 * licenced as follows:
 *
 *   Copyright 2012 Mozilla Foundation
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 */

// optimised CSS custom property getter/setter
var CustomStyle = (function CustomStyleClosure() {

    // As noted on: http://www.zachstronaut.com/posts/2009/02/17/
    //              animate-css-transforms-firefox-webkit.html
    // in some versions of IE9 it is critical that ms appear in this list
    // before Moz
    var prefixes = ['ms', 'Moz', 'Webkit', 'O'];
    var _cache = { };

    function CustomStyle() {
    }

    CustomStyle.getProp = function get(propName, element) {
        // check cache only when no element is given
        if (arguments.length == 1 && typeof _cache[propName] == 'string') {
            return _cache[propName];
        }

        element = element || document.documentElement;
        var style = element.style, prefixed, uPropName;

        // test standard property first
        if (typeof style[propName] == 'string') {
            return (_cache[propName] = propName);
        }

        // capitalize
        uPropName = propName.charAt(0).toUpperCase() + propName.slice(1);

        // test vendor specific properties
        for (var i = 0, l = prefixes.length; i < l; i++) {
            prefixed = prefixes[i] + uPropName;
            if (typeof style[prefixed] == 'string') {
                return (_cache[propName] = prefixed);
            }
        }

        //if all fails then set to undefined
        return (_cache[propName] = 'undefined');
    };

    CustomStyle.setProp = function set(propName, element, str) {
        var prop = this.getProp(propName);
        if (prop != 'undefined')
            element.style[prop] = str;
    };

    return CustomStyle;
})();


var TextLayerBuilder = function textLayerBuilder(textLayerDiv) {
    var textLayerFrag = document.createDocumentFragment();
    this.textLayerDiv = textLayerDiv;
    this.layoutDone = false;
    this.divContentDone = false;

    this.beginLayout = function textLayerBuilderBeginLayout() {
        this.textDivs = [];
        this.textLayerQueue = [];
    };

    this.endLayout = function textLayerBuilderEndLayout() {
        this.layoutDone = true;
        this.insertDivContent();
    };

    this.renderLayer = function textLayerBuilderRenderLayer() {
        var self = this;
        var textDivs = this.textDivs;
        var textLayerDiv = this.textLayerDiv;
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');

        // No point in rendering so many divs as it'd make the browser unusable
        // even after the divs are rendered
        if (textDivs.length > 100000)
            return;

        while (textDivs.length > 0) {
            var textDiv = textDivs.shift();
            textLayerFrag.appendChild(textDiv);

            ctx.font = textDiv.style.fontSize + ' ' + textDiv.style.fontFamily;
            var width = ctx.measureText(textDiv.textContent).width;

            if (width > 0) {
                var textScale = textDiv.dataset.canvasWidth / width;

                CustomStyle.setProp('transform' , textDiv,
                    'scale(' + textScale + ', 1)');
                CustomStyle.setProp('transformOrigin' , textDiv, '0% 0%');
            }
        }

        textLayerDiv.appendChild(textLayerFrag);
    };

    this.appendText = function textLayerBuilderAppendText(fontName, fontSize,
                                                          geom) {
        var textDiv = document.createElement('div');

        // vScale and hScale already contain the scaling to pixel units
        var fontHeight = fontSize * geom.vScale;
        textDiv.dataset.canvasWidth = geom.canvasWidth * geom.hScale;
        textDiv.dataset.fontName = fontName;

        textDiv.style.fontSize = fontHeight + 'px';
        textDiv.style.fontFamily = fontName;
        textDiv.style.left = geom.x + 'px';
        textDiv.style.top = (geom.y - fontHeight) + 'px';

        // The content of the div is set in the `setTextContent` function.

        this.textDivs.push(textDiv);
    };

    this.insertDivContent = function textLayerUpdateTextContent() {
        // Only set the content of the divs once layout has finished, the content
        // for the divs is available and content is not yet set on the divs.
        if (!this.layoutDone || this.divContentDone || !this.textContent)
            return;

        this.divContentDone = true;

        var textDivs = this.textDivs;
        var bidiTexts = this.textContent.bidiTexts;

        for (var i = 0; i < bidiTexts.length; i++) {
            var bidiText = bidiTexts[i];
            var textDiv = textDivs[i];

            textDiv.textContent = bidiText.str;
            textDiv.dir = bidiText.ltr ? 'ltr' : 'rtl';
        }

        this.renderLayer();
    };

    this.setTextContent = function textLayerBuilderSetTextContent(textContent) {
        this.textContent = textContent;
        this.insertDivContent();
    };
};


//
// NOTE:
// Modifying the URL below to another server will likely *NOT* work. Because of browser
// security restrictions, we have to use a file server with special headers
// (CORS) - most servers don't support cross-origin browser requests.
//
var url = 'http://cdn.mozilla.net/pdfjs/tracemonkey.pdf';

//
// Disable workers to avoid yet another cross-origin issue (workers need the URL of
// the script to be loaded, and currently do not allow cross-origin scripts)
//
PDFJS.disableWorker = true;

var pdfDoc = null,
    pageNum = 1,
    scale = 1.2,
    canvas = document.getElementById('the-canvas'),
    ctx = canvas.getContext('2d');

//
// Get page info from document, resize canvas accordingly, and render page
//
function renderPage(num) {
    // Using promise to fetch the page
    pdfDoc.getPage(num).then(function(page) {
        var viewport = page.getViewport(scale);
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        var div = document.getElementById("the-container");
        var oldTextLayer = document.querySelector('.textLayer')
        if(oldTextLayer) div.removeChild(oldTextLayer);
        var textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        div.insertBefore(textLayerDiv, canvas);
        var textLayer = textLayerDiv ? new TextLayerBuilder(textLayerDiv) : null;

        // Render PDF page into canvas context
        var renderContext = {
            canvasContext: ctx,
            viewport: viewport,
            textLayer: textLayer
        };
        page.render(renderContext);

        if (textLayer) {
            page.getTextContent().then(
                function textContentResolved(textContent) {
                    textLayer.setTextContent(textContent);
                }
            );
        }
    });

    // Update page counters
    document.getElementById('page_num').textContent = pageNum;
    document.getElementById('page_count').textContent = pdfDoc.numPages;
}

//
// Go to previous page
//
function goPrevious() {
    if (pageNum <= 1)
        return;
    pageNum--;
    renderPage(pageNum);
}

//
// Go to next page
//
function goNext() {
    if (pageNum >= pdfDoc.numPages)
        return;
    pageNum++;
    renderPage(pageNum);
}

//
// Asynchronously download PDF as an ArrayBuffer
//
PDFJS.getDocument(url).then(function getPdfHelloWorld(_pdfDoc) {
    pdfDoc = _pdfDoc;
    renderPage(pageNum);
});