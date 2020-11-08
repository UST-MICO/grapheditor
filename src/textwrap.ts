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

import {select, Selection} from 'd3-selection';

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
// eslint-disable-next-line complexity
export function wrapText(element: SVGTextElement, newText, force: boolean= false): void {
    const text = select(element);
    let x = parseFloat(text.attr('x'));
    if (isNaN(x)) {
        x = 0;
    }
    let y = parseFloat(text.attr('y'));
    if (isNaN(y)) {
        y = 0;
    }

    const wrapLines = text.attr('data-wrap-lines');

    let width = parseFloat(text.attr('width'));
    if (isNaN(width)) {
        width = parseFloat(text.attr('data-width'));
    }
    let height = parseFloat(text.attr('height'));
    if (isNaN(height)) {
        height = parseFloat(text.attr('data-height'));
    }
    if (isNaN(width) && wrapLines == null) {
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

    if (wrapLines != null) {
        // handle special wrap lines!
        wrapTextLines(text, newText, wrapLines, overflowMode, wordBreak, force);
        centerTextVertically(text, true);
        return;
    }

    if (isNaN(height)) {
        // no height => wrap a single line
        const overflow = lTrim(wrapSingleLine(element, width, newText, overflowMode, wordBreak, force));
        text.attr('data-wrapped', overflow !== '' ? 'true' : 'false');
        centerTextVertically(text, false);
        return;
    }

    // wrap multiline
    const spanSelection = calculateMultiline(text, height, x, y, force);
    const lines = spanSelection.nodes();
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const notLast = index < (lines.length - 1);
        newText = lTrim(wrapSingleLine(line, width, newText, notLast ? 'clip' : overflowMode, notLast ? wordBreak : 'break-all', force));
    }
    centerTextVertically(text, true);
}

/**
 * Trim trailing and leading whitespace
 *
 * @param text to trim
 */
export function trim(text: string) {
    return text.replace(/^\s+|\s+$/g, '');
}

/**
 * Trim trailing whitespace
 *
 * @param text to trim
 */
export function rTrim(text: string) {
    return text.replace(/\s+$/, '');
}

/**
 * Trim leading whitespace
 *
 * @param text to trim
 */
export function lTrim(text: string) {
    return text.replace(/^\s+/, '');
}

/**
 * Wrap the text based on a supplied lines definition.
 *
 * The lines definition is a string containing the maximum widths of the lines
 * to wrap text into. The widths can be floats, are seperated by single spaces
 * and parsed with `paseFloat`. Multiple line definitions are seperated by a
 * single '|' character.
 *
 * @param text the selection of the text element to wrap the text into
 * @param newText the new text to wrap
 * @param lines the line defs to use for wrapping
 * @param overflowMode the overflow mode
 * @param wordBreak the word break mode
 * @param force if wrapping should be forced
 */
export function wrapTextLines(text: Selection<SVGTextElement, unknown, null, undefined>, newText: string, lines: string, overflowMode, wordBreak, force: boolean) {
    const lineDefs = lines.split('|').map(lineDef => trim(lineDef));

    let lineheight = parseFloat(text.attr('data-lineheight'));
    if (force || isNaN(lineheight)) {
        lineheight = parseFloat(text.style('line-height'));
        if (isNaN(lineheight)) {
            text.selectAll('tspan').remove(); // remove all child elements before calculation
            text.text('M'); // use M as measurement character.
            lineheight = text.node().getExtentOfChar(0).height;
            text.text(null);
            text.attr("data-wrap-lines-used", null);
        }
        text.attr('data-lineheight', lineheight);
    }
    lineheight = Math.abs(lineheight); // don't allow negative lineheight

    const x = text.attr("x");
    const yBaseline = parseFloat(text.attr('y'));
    if (isNaN(yBaseline)) {
        console.error('Could not read attribute "y" of the text element!', text.node());
        return;
    }

    // calculate minimal length needed
    text.selectAll('tspan').remove();
    text.text(newText);
    const minimalCumulativeLineLength = text.node().getComputedTextLength();
    text.text(null);

    // iterate over line defs
    for (let lineDefIndex = 0; lineDefIndex < lineDefs.length; lineDefIndex++) {
        const lineDef = lineDefs[lineDefIndex];
        let currentNewText = newText;
        const lineWidths = lineDef.split(' ').map(parseFloat);
        if (lineWidths.some(isNaN)) {
            // cannot use this line def (use next)
            console.error('Could not parse lines def {lineDef}!');
            continue;
        }
        const cumulativeWidth = lineWidths.reduce((numA, numB) => {return numA + numB;}, 0);
        if (cumulativeWidth < minimalCumulativeLineLength && lineDefIndex < (lineDefs.length -1)) {
            // if not last linedef and wrap is expected to exceed all lines
            continue;
        }

        const lines = lineWidths.map((width, index) => {
            return {width: width, y: yBaseline + (lineheight * index)};
        });
        // generate tSpan elements for line def
        const spanSelection = text.selectAll<SVGTSpanElement, unknown>('tspan')
            .data(lines)
            .join(
                (enter) => {
                    return enter.append('tspan')
                        .attr('x', x)
                        .attr('y', d => d.y)
                        .attr('data-deltay', d => d.y - yBaseline);
                },
                (update) => {
                    return update
                        .attr('y', d => d.y)
                        .attr('data-deltay', d => d.y - yBaseline);
                }
            );

        const spans = spanSelection.nodes();
        let hasOverflow = true;
        for (let index = 0; index < spans.length; index++) { // wrap lines
            const line = spans[index];
            const width = lines[index].width;
            const notLast = index < (spans.length - 1);
            currentNewText = lTrim(wrapSingleLine(line, width, currentNewText, notLast ? 'clip' : overflowMode, notLast ? wordBreak : 'break-all', force));
            if (currentNewText.length == 0) {
                // no text left to wrap
                hasOverflow = false;
                break;
            }
        }
        if (!hasOverflow) {
            // no more overflow, stop iterating and use the current line def
            break;
        }
    }
}

/**
 * Center a svg text element vertically around the y coordinate specified in the
 * 'data-text-center-y' attribute of the text element.
 *
 * If the attribute is not set or cannot be parsed into a float this method does nothing.
 *
 * @param text the text selection to center vertically around the attribute 'data-text-center-y'
 * @param multiline true if the text is a multiline text containing tSpans
 */
export function centerTextVertically(text: Selection<SVGTextElement, unknown, null, undefined>, multiline: boolean=false) {
    const centerVertical = text.attr('data-text-center-y');
    if (centerVertical == null) {
        return;
    }
    const centerY = parseFloat(centerVertical);
    if (isNaN(centerY)) {
        return;
    }
    const textNode = text.node();
    const bbox = textNode.getBBox();
    const currentCy = ((bbox.y + bbox.height) + bbox.y) / 2;

    const delta = centerY - currentCy;
    if (Math.abs(delta) > 0.00001) {
        if (!multiline) {
            // center single line strings by directly adjusting y
            const yBaseline = parseFloat(text.attr("y"));
            if (isNaN(yBaseline)) {
                console.error('Could not read attribute "y" of the text element that should be centered vertically!', textNode);
                return;
            }
            text.attr("y", yBaseline + delta);
        } else {
            // use a transform for multiline strings to transform all tSpans at once
            text.attr("transform", `translate(0,${delta})`);
        }
    }
}

/**
 * Calculate and create a multiline span group.
 *
 * @param text parent text element
 * @param height max height
 * @param x x coordinate
 * @param y y coordinate
 * @param force force rewrap
 * @param linespacing 'auto' or number (default: 'auto')
 */
export function calculateMultiline(text: Selection<SVGTextElement, unknown, null, undefined>, height: number, x: number, y: number, force: boolean= false, linespacing: string= 'auto') {
    let lineheight = parseFloat(text.attr('data-lineheight'));
    if (force || isNaN(lineheight)) {
        lineheight = parseFloat(text.style('line-height'));
        if (isNaN(lineheight)) {
            text.selectAll('tspan').remove(); // remove all child elements before calculation
            text.text('M'); // use M as measurement character.
            lineheight = text.node().getExtentOfChar(0).height;
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

    const spanSelection = text.selectAll<SVGTSpanElement, unknown>('tspan').data(lines);
    spanSelection.exit().remove();
    return spanSelection.enter().append('tspan')
        .attr('x', x)
        .attr('y', d => d)
        .attr('data-deltay', d => d - y)
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
 * @returns the overflow text
 */
// eslint-disable-next-line complexity
export function wrapSingleLine(element: SVGTextElement|SVGTSpanElement, width: number,
    newText: string, mode: string = 'ellipsis', wordBreak: string = 'break-word', force: boolean= false
): string {

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
            return suffix;
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
        return suffix;
    }
    const boundary = /(?<!^)(?<!\d[,.])\b(?![,.]\d)\s*|\s+|$/gmu;
    const nextWordBoundary = boundary.exec(newText)?.index ?? 0;
    const isOneWord = nextWordBoundary === 0 || nextWordBoundary === newText.length

    if (wordBreak === 'break-all' || isOneWord) {
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
function wrapCharacters(newText: string, text: Selection<SVGTextElement|SVGTSpanElement, unknown, null, undefined>, width: number, overflowChar: string) {
    // find out width of overflow char
    const textNode = text.node();
    let overflowCharWidth = 0;
    if (overflowChar) {
        text.text(overflowChar);
        overflowCharWidth = textNode.getExtentOfChar(0).width;
        text.text(newText);
    }
    // find better upper bound from svg
    const start = textNode.getStartPositionOfChar(0);
    start.x += (width - overflowCharWidth);
    // always a char here as this method only gets called when the line is too long
    let firstOutside = textNode.getCharNumAtPosition(start);
    if (firstOutside < 0) { // because firefox sometimes does this...
        firstOutside = bruteForceLastOutside(textNode, newText.length, start.x)
    }
    let lastNonClippingChar = firstOutside;

    for (let char = firstOutside; char > 0; char--) {
        const charStart = textNode.getEndPositionOfChar(char);
        if (charStart.x < start.x) {
            lastNonClippingChar = char;
            break;
        }
    }

    const newSubstring = rTrim(newText.substr(0, lastNonClippingChar));
    if (overflowChar) {
        text.text(newSubstring + overflowChar);
    } else {
        text.text(newSubstring);
    }
    return lTrim(newText.substr(lastNonClippingChar));
}


/**
 * Wrap single line, can break at spaces only.
 *
 * @param newText new text to set
 * @param text d3 selection of element to wrap text into
 * @param width width of the  line
 * @param overflowChar wrapping mode
 */
function wrapWords(newText: string, text: Selection<SVGTextElement|SVGTSpanElement, unknown, null, undefined>, width: number, overflowChar: string) {
    // find out width of overflow char
    const textNode = text.node();
    let overflowCharWidth = 0;
    if (overflowChar) {
        text.text(overflowChar);
        overflowCharWidth = textNode.getExtentOfChar(0).width;
        text.text(newText);
    }
    // find better upper bound from svg
    const start = textNode.getStartPositionOfChar(0);
    start.x += (width - overflowCharWidth);
    // always a char here as this method only gets called when the line is too long
    let firstOutside = textNode.getCharNumAtPosition(start);
    if (firstOutside < 0 || textNode.getStartPositionOfChar(firstOutside).x > start.x) { // because firefox sometimes does this...
        // sometimes firefox does not find the char (firstOutside == -1)
        // sometimes the char firefox found is not correct (second check tests if that char actually starts inside the bounds)
        firstOutside = bruteForceLastOutside(textNode, newText.length, start.x)
    }

    const WORD_BOUNDARY = /(?<!^)(?<!\d[,.])\b(?![,.]\d)\s*|\s+|$/gmu;
    let lastIndex = WORD_BOUNDARY.lastIndex;
    let lastBoundary: RegExpExecArray;
    let boundary: RegExpExecArray = WORD_BOUNDARY.exec(newText);

    let lastInsideBoundary = null;

    let counter = 0; // counter to catch infinite loops
    while (boundary.index < (newText.length - 1) && !(lastBoundary == null && boundary == null)) {
        counter ++;
        if (counter > 10000) {
            console.warn('Wrapping the text encountered a loop!', 'Text to wrap:', newText);
            break;
        }
        if (boundary.index <= firstOutside) {
            lastInsideBoundary = boundary.index;
        } else {
            break;
        }
        lastBoundary = boundary;
        if (boundary.length > 0) {
            WORD_BOUNDARY.lastIndex += boundary.length;
            lastIndex = WORD_BOUNDARY.lastIndex;
        }
        boundary = WORD_BOUNDARY.exec(newText);
        if (boundary.index === lastIndex) {
            boundary = WORD_BOUNDARY.exec(newText);
            if (boundary == null) {
                break; // WORD_BOUNDARY.lastIndex already exceeds newText.length
            }
        }
    }
    if (lastInsideBoundary == null) {
        // one long word
        return wrapCharacters(newText, text, width, '-');
    }
    text.text(rTrim(newText.substr(0, lastInsideBoundary)) + overflowChar);
    return lTrim(newText.substr(lastInsideBoundary));
}

/**
 * Brute force find the character that crosses the xBoundary (because firefox).
 *
 * @param textNode the text or tSpan node in question
 * @param textLength the maximum length of the string inside that node
 * @param xBoundary the x coordinate that the text element must not cross
 */
function bruteForceLastOutside(textNode: SVGTextElement|SVGTSpanElement, textLength: number, xBoundary: number): number {
    const maxChars = textNode.getNumberOfChars();
    for (let i = 0; i < textLength; i++) {
        if (maxChars !== 0 && i >= maxChars) { // firefox may also report getNumberOfChars() as 0
            return i;
        }
        try {
            const end = textNode.getEndPositionOfChar(i);
            if (end.x > xBoundary) {
                return i;
            }
        } catch (error) { // catch error when trying to access character that cannot be accessed
            return i;
        }
    }
    return textLength;
}
