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

import { select, Selection } from 'd3-selection';

/**
 * Properties used to wrap text in a text element.
 */
interface TextProperties {
    x: number;
    y: number;
    width?: number;
    height?: number;
    wrapLines?: string;
    wrapLineDefIndex?: number;
    lineheight?: number;
    centerY?: number;
    overflowMode?: string;
    wordBreak?: string;
    lastWrappedText?: string;
    lastWrappedOverflow?: boolean;
}

/**
 * Determine if the properties have changed significantly.
 *
 * @param newProps new text wrapping properties
 * @param oldProps old text wrapping properties
 * @returns true iff the properties have changed in a way that makes re-wrapping text neccessary
 */
function propsHaveChanged(newProps: TextProperties, oldProps: TextProperties) {
    if (newProps.x !== oldProps.x) {
        return true;
    }
    if (newProps.y !== oldProps.y) {
        return true;
    }
    if (newProps.width !== oldProps.width) {
        return true;
    }
    if (newProps.height !== oldProps.height) {
        return true;
    }
    if (newProps.wrapLines !== oldProps.wrapLines) {
        return true;
    }
    if (newProps.centerY !== oldProps.centerY) {
        return true;
    }
    if (newProps.overflowMode !== oldProps.overflowMode) {
        return true;
    }
    if (newProps.wordBreak !== oldProps.wordBreak) {
        return true;
    }
    return false;
}

/** Cache for the last used text wrapping properties by text element. */
const textCache: WeakMap<SVGTextElement|SVGTSpanElement, TextProperties> = new WeakMap();

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
export function wrapText(element: SVGTextElement, newText: string, force: boolean = false): void {
    const text = select(element);
    let x = parseFloat(text.attr('x'));
    if (isNaN(x)) {
        x = 0;
    }
    let y = parseFloat(text.attr('y'));
    if (isNaN(y)) {
        y = 0;
    }

    const props: TextProperties = {
        x: x,
        y: y,
    };

    // explicit line wrapping definition
    const wrapLines = text.attr('data-wrap-lines');

    // width and height
    let width = parseFloat(text.attr('width'));
    if (isNaN(width)) {
        width = parseFloat(text.attr('data-width'));
    }
    let height = parseFloat(text.attr('height'));
    if (isNaN(height)) {
        height = parseFloat(text.attr('data-height'));
    }

    // save values in props
    if (!isNaN(width)) {
        props.width = width;
    }
    if (!isNaN(height)) {
        props.height = height;
    }
    if (wrapLines != null) {
        props.wrapLines = wrapLines;
    }

    if (isNaN(width) && wrapLines == null) {
        // no text wrapping possible (missing information)
        text.selectAll('tspan').remove(); // clear previous dom content
        text.text(newText);
        textCache.delete(text.node()); // clear all properties
        return;
    }

    // parse vertical text center
    const verticalCenter = text.attr('data-text-center-y');
    let centerY: number;
    if (verticalCenter != null) {
        centerY = parseFloat(verticalCenter);
    }
    if (centerY != null && isNaN(centerY)) {
        centerY = null;
    }
    const isCenteredVertically = centerY != null;

    if (isCenteredVertically) {
        props.centerY = centerY;
    }

    // get overflowMode from css style attribute
    let overflowMode = text.style('text-overflow');
    if (overflowMode == null) {
        overflowMode = 'ellipsis';
    }
    props.overflowMode = overflowMode;

    // get wordBreak from css style attribute
    let wordBreak = text.style('word-break');
    if (wordBreak == null) {
        wordBreak = 'break-word';
    }
    props.wordBreak = wordBreak;

    const oldProps = textCache.get(text.node());
    if (!force && oldProps != null && !propsHaveChanged(props, oldProps)) {
        if (newText.startsWith(oldProps.lastWrappedText)) {
            if (oldProps.lastWrappedOverflow) {
                return; // text that may have changed is not shown visually
            }
            if (newText.length === oldProps.lastWrappedText.length) {
                return; // text is completely the same
            }
        }
    }

    if (wrapLines != null) {
        // handle special wrap lines!
        const def = wrapTextLines(text, newText, props, force);
        resetTextTransform(text, isCenteredVertically);
        if (def.scale !== 1) {
            scaleText(text, def.scale);
        }
        const newY = centerTextVertically(text, centerY, true);
        if (newY != null) {
            props.y = newY;
        }
        textCache.set(text.node(), props);
        return;
    }

    if (isNaN(height)) {
        // no height => wrap a single line
        const unwrappedText = wrapSingleLine(element, width, newText, overflowMode, wordBreak, force);
        props.lastWrappedText = newText.substring(0, newText.length - unwrappedText.length);
        props.lastWrappedOverflow = lTrim(unwrappedText) !== '';
        resetTextTransform(text, isCenteredVertically);
        const newY = centerTextVertically(text, centerY, false);
        if (newY != null) {
            props.y = newY;
        }
        textCache.set(text.node(), props);
        return;
    }

    // wrap multiline
    const spanSelection = calculateMultiline(text, height, x, y, force);
    const lines = spanSelection.nodes();
    let currentNewText = newText;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const notLast = index < (lines.length - 1);
        const unwrappedText = wrapSingleLine(line, width, currentNewText, notLast ? 'clip' : overflowMode, notLast ? wordBreak : 'break-all', force);
        currentNewText = lTrim(unwrappedText);
        props.lastWrappedText = newText.substring(0, newText.length - unwrappedText.length);
        props.lastWrappedOverflow = currentNewText !== '';
    }
    resetTextTransform(text, isCenteredVertically);
    const newY = centerTextVertically(text, centerY, true);
    if (newY != null) {
        props.y = newY;
    }
    textCache.set(text.node(), props);
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
 * Line Wrapping definitions contain a list of widths (each width is one line
 * wrapped with that width) and a scale to scale text by.
 */
interface LineWrappingDefinition {
    lineWidths: number[];
    scale: number;
}

/**
 * Parse a line wrapping definition into a list of {@link LineWrappingDefinition}.
 *
 * @param lineDefs the line wrapping definition string to parse
 */
function parseLineDefs(lineDefs: string): LineWrappingDefinition[] {
    const defs: LineWrappingDefinition[] = [];
    lineDefs.split('|').map(lineDef => trim(lineDef)).forEach(lineDef => {
        const def: LineWrappingDefinition = {
            lineWidths: [],
            scale: 1,
        };
        const widths = lineDef.split(' ');

        if (widths.length === 0) {
            console.error(`Could not parse lines def ${lineDef}! No lines specified.`);
            return;
        }

        if (widths[0].endsWith('x')) {
            const scale = widths[0];
            def.scale = parseFloat(scale.substring(0, scale.length - 1));
            if (isNaN(def.scale)) {
                console.error(`Could not parse lines def ${lineDef}! Scale is NaN.`);
                return;
            }
            widths.splice(0, 1);
            if (widths.length === 0) {
                console.error(`Could not parse lines def ${lineDef}! No lines specified.`);
                return;
            }
        }

        def.lineWidths = widths.map(parseFloat);

        if (def.lineWidths.some(isNaN)) {
            // cannot use this line def
            console.error(`Could not parse lines def ${lineDef}! A line width was NaN.`);
            return;
        }

        defs.push(def);
    });

    return defs;
}

/**
 * Wrap the text based on a supplied lines definition.
 *
 * The lines definition is a string containing the maximum widths of the lines
 * to wrap text into. The widths can be floats, are seperated by single spaces
 * and parsed with `paseFloat`. Multiple line definitions are seperated by a
 * single '|' character.
 *
 * A line definition can optionally start with a scale (marked with an `x`
 * directly after the number). The scale is returned as part of the line
 * definition. It can be applied by {@link scaleText}. To get a more intuitive
 * scaling behaviour first reset the transform property and the transform
 * origin with {@link resetTextTransform}.
 *
 * @param text the selection of the text element to wrap the text into
 * @param newText the new text to wrap
 * @param props the properties of the element to wrap
 * @param force if wrapping should be forced
 *
 * @returns the used lines wrapping definition
 */
// eslint-disable-next-line complexity
export function wrapTextLines(text: Selection<SVGTextElement, unknown, null, undefined>, newText: string, props: TextProperties, force: boolean): LineWrappingDefinition {
    let maxHeight = props.height;
    if (isNaN(maxHeight)) {
        maxHeight = null;
    }
    const lineDefs = parseLineDefs(props.wrapLines);

    const oldProps = textCache.get(text.node());

    let lineheight = parseFloat(text.attr('data-lineheight'));
    if (force || isNaN(lineheight)) {
        lineheight = calculateLineHeight(text);
    }
    lineheight = Math.abs(lineheight); // don't allow negative lineheight
    props.lineheight = lineheight;

    // filter out line defs that lead to too long text
    const allowedLineDefs = lineDefs.filter((def, index) => index === 0 || maxHeight == null || (def.lineWidths.length * lineheight * def.scale) <= maxHeight);
    if (allowedLineDefs.length === 0) {
        console.error(`No line wrapping definition found that is smaller than the max height ${maxHeight}.`, props.wrapLines);
    }

    const x = text.attr('x');
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

    // check shortcuts based on older attempts
    let firstLineDefIndex = 0;
    if (
        oldProps != null
        && oldProps.wrapLines === props.wrapLines
        && oldProps.lineheight === props.lineheight
        && newText.startsWith(oldProps.lastWrappedText)
        && oldProps.lastWrappedOverflow
    ) {
        // found possible shortcut
        firstLineDefIndex = oldProps.wrapLineDefIndex;
    }

    let usedDef: LineWrappingDefinition;
    // iterate over line defs
    for (let lineDefIndex = firstLineDefIndex; lineDefIndex < allowedLineDefs.length; lineDefIndex++) {
        const lineDef = allowedLineDefs[lineDefIndex];
        usedDef = lineDef;
        props.wrapLineDefIndex = lineDefIndex;
        let currentNewText = newText;
        const lineWidths = lineDef.lineWidths;
        // eslint-disable-next-line arrow-body-style
        const cumulativeWidth = lineWidths.reduce((numA, numB) => { return numA + numB; }, 0);
        if (cumulativeWidth < minimalCumulativeLineLength && lineDefIndex < (allowedLineDefs.length - 1)) {
            // if not last linedef and wrap is expected to exceed all lines
            continue;
        }

        const lines = lineWidths.map((width, index) => {
            return { width: width, y: yBaseline + (lineheight * index) };
        });
        // generate tSpan elements for line def
        const spanSelection = text.selectAll<SVGTSpanElement, unknown>('tspan')
            .data(lines)
            .join(
                // eslint-disable-next-line arrow-body-style
                (enter) => {
                    return enter.append('tspan')
                        .attr('x', x)
                        .attr('y', d => d.y)
                        .attr('data-deltay', d => d.y - yBaseline);
                },
                // eslint-disable-next-line arrow-body-style
                (update) => {
                    return update
                        .attr('y', d => d.y)
                        .attr('data-deltay', d => d.y - yBaseline);
                }
            );

        props.lastWrappedText = '';
        const spans = spanSelection.nodes();
        let hasOverflow = true;
        for (let index = 0; index < spans.length; index++) { // wrap lines
            const line = spans[index];
            const width = lines[index].width;
            const notLast = index < (spans.length - 1);
            const lastWrappedText = wrapSingleLine(line, width, currentNewText, notLast ? 'clip' : props.overflowMode, notLast ? props.wordBreak : 'break-all', force);
            props.lastWrappedText = newText.substring(0, newText.length - lastWrappedText.length);
            currentNewText = lTrim(lastWrappedText);
            if (currentNewText.length === 0) {
                // no text left to wrap
                hasOverflow = false;
                break;
            }
        }
        props.lastWrappedOverflow = hasOverflow;
        if (!hasOverflow) {
            // no more overflow, stop iterating and use the current line def
            break;
        }
    }
    return usedDef;
}

/**
 * Reset the "transform" attribute and set a more useful transform origin for
 * scaling text.
 *
 * The new transform origin x position is the same as the text node x coordinate.
 * This ensures that text will always scale towards the text anchor horizontally.
 *
 * The new transform origin y position depends on the parameter `isVerticallyCentered`.
 * If the text is centered vertically it is set to the mindpoint between the bbox
 * top and bottom. If the text is not centered vertically then the bbox top is used.
 *
 * Using this method before the text was wrapped may cause the transform origin
 * to be in a weird place.
 *
 * @param text the text selection to reset the transformation for (must have an x attribute!)
 * @param isVerticallyCentered if the text is vertically centered it should scale from/towards that center vertically
 */
export function resetTextTransform(text: Selection<SVGTextElement, unknown, null, undefined>, isVerticallyCentered: boolean= false) {
    const textNode = text.node();
    const bbox = textNode.getBBox();
    const originX = text.attr('x') ?? 0;
    let originY: number;
    if (isVerticallyCentered) {
        // ensure text scales towards the vertical center
        originY = bbox.y + (bbox.height / 2);
    } else {
        // ensure text scales to the top
        originY = bbox.y;
    }
    text.style('transform-origin', `${originX}px ${originY}px`);
    text.attr('transform', null);
}

/**
 * Scale a text element with the "transform" attribute.
 *
 * This method preserves the content of the "transform" attribute by prepending
 * the new scale!
 *
 * @param text the text to scale
 * @param scale the scale factor
 */
export function scaleText(text: Selection<SVGTextElement, unknown, null, undefined>, scale: number) {
    const oldTransform = text.attr('transform') ?? '';
    text.attr('transform', `scale(${scale})${oldTransform}`);
}

/**
 * Center a svg text element vertically around the y coordinate specified in the
 * 'data-text-center-y' attribute of the text element.
 *
 * If the attribute is not set or cannot be parsed into a float this method does nothing.
 *
 * If multiline is true then the "transform" attribute of the text node is used
 * to translate the text. This method preserves the content of the "transform"
 * attribute by prepending translation!
 *
 * @param text the text selection to center vertically around the attribute 'data-text-center-y'
 * @param centerY if set, this value is used instead of the attribute 'data-text-center-y'
 * @param multiline true if the text is a multiline text containing tSpans
 * @returns the new y coordinate set (if any)
 */
export function centerTextVertically(text: Selection<SVGTextElement, unknown, null, undefined>, centerY?: number, multiline: boolean = false) {
    if (centerY == null) {
        // try to parse center from text node
        const centerVertical = text.attr('data-text-center-y');
        if (centerVertical == null) {
            return;
        }
        centerY = parseFloat(centerVertical);
    }
    if (isNaN(centerY)) {
        return;
    }
    const textNode = text.node();
    const bbox = textNode.getBBox();
    const currentCy = bbox.y + (bbox.height / 2);

    const delta = centerY - currentCy;

    if (Math.abs(delta) > 0.00001) {
        if (!multiline) {
            // center single line strings by directly adjusting y
            const yBaseline = parseFloat(text.attr('y'));
            if (isNaN(yBaseline)) {
                console.error('Could not read attribute "y" of the text element that should be centered vertically!', textNode);
                return;
            }
            text.attr('y', yBaseline + delta);
            return yBaseline + delta;
        } else {
            // use a transform for multiline strings to transform all tSpans at once
            const oldTransform = text.attr('transform') ?? '';
            text.attr('transform', `translate(0,${delta})${oldTransform}`);
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
// eslint-disable-next-line max-len
export function calculateMultiline(text: Selection<SVGTextElement, unknown, null, undefined>, height: number, x: number, y: number, force: boolean = false, linespacing: string = 'auto') {
    let lineheight = parseFloat(text.attr('data-lineheight'));
    if (force || isNaN(lineheight)) {
        lineheight = calculateLineHeight(text);
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
 * Calculate the line height of a text element from its css style.
 *
 * Falls back to measuring the character 'M' to extract the actual line height.
 *
 * @param text the text element to calculate the line height for
 * @returns the line height in svg units
 */
function calculateLineHeight(text: Selection<SVGTextElement, unknown, null, undefined>) {
    let lineheight: number;
    const styleLineheight = text.style('line-height');
    const styleFontSize = text.style('font-size');
    let fontSize = NaN;
    if (styleFontSize.endsWith('px')) {
        fontSize = parseFloat(styleFontSize);
    }
    if (styleLineheight === 'normal') {
        lineheight = 1.2 * fontSize;
    }
    if (styleLineheight.match('^\d+\.?\d*$')) {
        lineheight = parseFloat(styleLineheight) * fontSize;
    }
    if (styleLineheight.endsWith('px')) {
        lineheight = parseFloat(styleLineheight);
    }
    if (isNaN(lineheight)) {
        text.selectAll('tspan').remove(); // remove all child elements before calculation
        text.text('M'); // use M as measurement character.
        lineheight = text.node().getExtentOfChar(0).height;
        text.text(null);
    }
    return lineheight;
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
export function wrapSingleLine(element: SVGTextElement | SVGTSpanElement, width: number,
    newText: string, mode: string = 'ellipsis', wordBreak: string = 'break-word', force: boolean = false
): string {

    const text = select(element);
    const oldText = text.text();

    // Allow manual linewraps with newline
    let suffix = '';

    if (newText.includes('\n')) {
        const index = newText.indexOf('\n');
        suffix = newText.substring(index);
        newText = newText.substring(0, index);
    }

    // shortcuts (when text is already wrapped)
    if (!force && oldText != null && oldText !== '') {
        if (oldText.startsWith(newText)) {
            // newText is shorter
            text.text(newText);
            return suffix;
        }
    }

    // Try naive without wrapping
    text.text(newText);
    if (text.node().getComputedTextLength() <= width) {
        return suffix;
    }
    const boundary = /(?<!^)(?<!\d[,.])\b(?![,.]\d)\s*|\s+|$/gmu;
    const nextWordBoundary = boundary.exec(newText)?.index ?? 0;
    const isOneWord = nextWordBoundary === 0 || nextWordBoundary === newText.length;

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
function wrapCharacters(newText: string, text: Selection<SVGTextElement | SVGTSpanElement, unknown, null, undefined>, width: number, overflowChar: string) {
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
        firstOutside = bruteForceLastOutside(textNode, newText.length, start.x);
    }
    let lastNonClippingChar = firstOutside;

    for (let char = firstOutside; char > 0; char--) {
        const charStart = textNode.getEndPositionOfChar(char);
        if (charStart.x < start.x) {
            lastNonClippingChar = char;
            break;
        }
    }

    const newSubstring = rTrim(newText.substring(0, lastNonClippingChar));
    if (overflowChar) {
        text.text(newSubstring + overflowChar);
    } else {
        text.text(newSubstring);
    }
    return lTrim(newText.substring(lastNonClippingChar));
}


/**
 * Wrap single line, can break at spaces only.
 *
 * @param newText new text to set
 * @param text d3 selection of element to wrap text into
 * @param width width of the  line
 * @param overflowChar wrapping mode
 */
// eslint-disable-next-line complexity
function wrapWords(newText: string, text: Selection<SVGTextElement | SVGTSpanElement, unknown, null, undefined>, width: number, overflowChar: string) {
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
        firstOutside = bruteForceLastOutside(textNode, newText.length, start.x);
    }

    const WORD_BOUNDARY = /(?<!^)(?<!\d[,.])\b(?![,.]\d)\s*|\s+|$/gmu;
    let lastIndex = WORD_BOUNDARY.lastIndex;
    let lastBoundary: RegExpExecArray;
    let boundary: RegExpExecArray = WORD_BOUNDARY.exec(newText);

    let lastInsideBoundary = null;

    let counter = 0; // counter to catch infinite loops
    while (boundary.index < (newText.length - 1) && !(lastBoundary == null && boundary == null)) {
        counter++;
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
    text.text(rTrim(newText.substring(0, lastInsideBoundary)) + overflowChar);
    return lTrim(newText.substring(lastInsideBoundary));
}

/**
 * Brute force find the character that crosses the xBoundary (because firefox).
 *
 * @param textNode the text or tSpan node in question
 * @param textLength the maximum length of the string inside that node
 * @param xBoundary the x coordinate that the text element must not cross
 */
function bruteForceLastOutside(textNode: SVGTextElement | SVGTSpanElement, textLength: number, xBoundary: number): number {
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
