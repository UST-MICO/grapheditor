/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {select} from 'd3';

/**
 * Wrap text in an svg text element.
 *
 * Only wraps text if a 'width' or 'data-width' attribute is
 * present on text element.
 *
 * For multiline wrapping an additional 'height' or 'data-height'
 * attribute is neccessary.
 *
 * Partly uses css attributes 'text-overflow' and 'word-break'
 * to determine how to wrap text.
 *
 * @param element element to wrap text into
 * @param newText text to wrap
 * @param force force rewrap
 */
export function wrapText(element: SVGTextElement, newText, force: boolean= false) {
    const text = select(element);
    const x = parseFloat(text.attr('x'));
    const y = parseFloat(text.attr('y'));
    let width = parseFloat(text.attr('width'));
    if (isNaN(width)) {
        width = parseFloat(text.attr('data-width'));
    }
    let height = parseFloat(text.attr('height'));
    if (isNaN(height)) {
        height = parseFloat(text.attr('data-height'));
    }
    if (isNaN(width)) {
        text.text(newText);
        return;
    }

    // get overflowMode from css style attribute
    let overflowMode = text.style('text-overflow');
    if (overflowMode == null) {
        overflowMode = 'ellipsis';
    }

    // get wordBreak from css style attribute
    let wordBreak = text.style('word-break');
    if (wordBreak == null) {
        wordBreak = 'break-word';
    }


    if (isNaN(height)) {
        const overflow = lTrim(wrapSingleLine(element, width, newText, overflowMode, wordBreak, force));
        text.attr('data-wrapped', overflow !== '' ? 'true' : 'false');
        return;
    }

    // wrap multiline
    const spanSelection = calculateMultiline(text, height, x, y); // TODO rerun lineheight detection for forced text wrapping
    const lines = spanSelection.nodes();
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const notLast = index < (lines.length - 1);
        newText = lTrim(wrapSingleLine(line, width, newText, notLast ? 'clip' : overflowMode, notLast ? wordBreak : 'break-all', force));
    }
}

/**
 * Trim trailing whitespace
 *
 * @param text to trim
 */
function rTrim(text: string) {
    return text.replace(/\s+$/, '');
}

/**
 * Trim leading whitespace
 *
 * @param text to trim
 */
function lTrim(text: string) {
    return text.replace(/^\s+/, '');
}

/**
 * Calculate and create a multiline span group.
 *
 * @param text parent text element
 * @param height max height
 * @param x x coordinate
 * @param y y coordinate
 * @param linespacing 'auto' or number (default: 'auto')
 */
function calculateMultiline(text, height, x, y, linespacing: string= 'auto') {
    let lineheight = parseFloat(text.attr('data-lineheight'));
    if (isNaN(lineheight)) {
        lineheight = parseFloat(text.style('line-height'));
        if (isNaN(lineheight)) {
            text.text('M'); // use M as measurement character.
            lineheight = text.node().getBBox().height;
            text.text(null);
        }
        text.attr('data-lineheight', lineheight);
    }
    lineheight = Math.abs(lineheight); // don't allow negative lineheight
    const lines: number[] = [];
    if (linespacing === 'auto') {
        // ideal linespacing => max number of lines, equal distance, last line at y+height
        let nrOfLines = Math.floor(height / lineheight);
        if (nrOfLines <= 0) {
            nrOfLines = 1;
        } else {
            lineheight = height / nrOfLines;
        }
        linespacing = '1';
    }
    let currentY = 0;
    let factor = parseFloat(linespacing);
    if (isNaN(factor)) {
        factor = 1;
    }
    factor = Math.abs(factor); // don't allow negative factors
    while (currentY < height) {
        lines.push(y + currentY);
        currentY += lineheight * factor;
    }

    const spanSelection = text.selectAll('tspan').data(lines);
    spanSelection.exit().remove();
    return spanSelection.enter().append('tspan')
        .attr('x', x)
        .attr('y', d => d)
        .attr('data-deltay', d => d-y)
      .merge(spanSelection);
}

/**
 * Wrap text in a single line and return the overflow.
 *
 * @param element element to wraptext into
 * @param width max linewidth for text
 * @param newText new text to set
 * @param mode wrapping mode
 * @param wordBreak break mode
 * @param force force rewrap
 */
function wrapSingleLine(element: SVGTextElement|SVGTSpanElement, width: number,
                        newText: string, mode: string = 'ellipsis',
                        wordBreak: string = 'break-word', force: boolean= false): string {

    const text = select(element);
    const oldText = text.text();

    // Allow manual linewraps with newline
    let suffix = '';

    if (newText.includes('\n')) {
        const index = newText.indexOf('\n');
        suffix = newText.substr(index);
        newText = newText.substring(0, index);
    }

    // shortcuts (when text is already wrapped)
    if (!force && oldText != null && oldText !== '') {
        if (oldText.startsWith(newText)) {
            // newText is shorter
            text.text(newText);
            return '' + suffix;
        } else if (mode === 'clip') {
            if (text.attr('data-wrapped') === 'true' && newText.startsWith(oldText)) {
                // odlText was wrapped and newText begins with oldText
                return newText.substr(oldText.length) + suffix;
            }
        } else {
            if (newText.endsWith('…')) {
                // oldText was wrapped (starts with '…')
                if (newText.startsWith(oldText.substr(0, oldText.length - 1))) {
                    // newText begins with oldText
                    return newText.substr(oldText.length - 1) + suffix;
                }
            }
        }
    }

    // Try naive without wrapping
    text.text(newText);
    if (text.node().getComputedTextLength() <= width) {
        return '' + suffix;
    }

    if (wordBreak === 'break-all' || newText.indexOf(' ') < 0) {
        return wrapCharacters(newText, text, width, mode === 'clip' ? '' : '…') + suffix;
    } else {
        return wrapWords(newText, text, width, mode === 'clip' ? '' : '…') + suffix;
    }
}

/**
 * Wrap single line, can break after every character.
 *
 * @param newText new text to set
 * @param text d3 selection of element to wrap text into
 * @param width width of the  line
 * @param overflowChar wrapping mode
 */
function wrapCharacters(newText: string, text: any, width: number, overflowChar: string) {
    let divider = newText.length;
    const lastText = newText;
    let step = newText.length;
    let counter = 0;
    // upper bound to catch infinite loops
    const maxStepsAllowed = Math.log2(newText.length) + 10;
    // perform binary search for division point
    while (step > 1 && counter < maxStepsAllowed) {
        counter++;
        step = Math.ceil(step / 2);
        if (text.node().getComputedTextLength() > width) {
            divider -= step;
        } else {
            divider += step;
        }
        text.text(rTrim(newText.substr(0, divider)) + overflowChar);
    }
    if (text.node().getComputedTextLength() > width) {
        divider -= step;
        text.text(rTrim(newText.substr(0, divider)) + overflowChar);
    }
    return newText.substr(divider);
}


/**
 * Wrap single line, can break at spaces only.
 *
 * @param newText new text to set
 * @param text d3 selection of element to wrap text into
 * @param width width of the  line
 * @param overflowChar wrapping mode
 */
function wrapWords(newText: string, text: any, width: number, overflowChar: string) {
    const WORD_BOUNDARY = /\b\s*/g;
    // start searching from the first charcter in the string
    // don't start with 0 because 0 is always a word boundary
    WORD_BOUNDARY.lastIndex = 1;
    let lastIndex = WORD_BOUNDARY.lastIndex;
    let lastBoundary: RegExpExecArray;
    let boundary: RegExpExecArray = WORD_BOUNDARY.exec(newText);

    let counter = 0; // counter to catch infinite loops
    while (boundary.index < newText.length && !(lastBoundary == null && boundary == null)) {
        counter ++;
        if (counter > 10000) {
            console.warn('Wrapping the text encountered a loop!', 'Text to wrap:', newText);
            break;
        }
        text.text(rTrim(newText.substr(0, boundary.index)) + overflowChar);
        if (text.node().getComputedTextLength() > width) {
            // last word was too much
            break;
        }
        lastBoundary = boundary;
        if (boundary.length > 0) {
            WORD_BOUNDARY.lastIndex += boundary.length;
            lastIndex = WORD_BOUNDARY.lastIndex;
        }
        boundary = WORD_BOUNDARY.exec(newText);
        if (boundary.index === lastIndex) {
            WORD_BOUNDARY.lastIndex++;
            boundary = WORD_BOUNDARY.exec(newText);
        }
    }
    if (lastBoundary == null) {
        // one long word
        return wrapCharacters(newText, text, width, '-');
    }
    text.text(rTrim(newText.substr(0, lastBoundary.index)) + overflowChar);
    return lTrim(newText.substr(lastBoundary.index));
}
