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
import { Rect, calculateBoundingRect } from './util';

/**
 * Cache for specific text measurements.
 */
interface TextCache {
    font: string;
    measurements: Map<string, number>;
    measuredLineHeight?: number;
}

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
    font?: string;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    fontVariant?: string;
    lang?: string;
    overflowMode?: string;
    wordBreak?: string;
    lastWrappedText?: string;
    lastWrappedOverflow?: boolean;
    textCache?: TextCache;
}

/**
 * Build a font string from text properties.
 *
 * @param props text properties
 * @returns css font string that can be used with the canvas api
 */
function textPropertiesToFont(props: TextProperties): string {
    let font: string = '';
    if (props.fontStyle) {
        font += `${props.fontStyle} `;
    }
    if (props.fontVariant) {
        font += `${props.fontVariant} `;
    }
    if (props.fontWeight) {
        font += `${props.fontWeight} `;
    }
    if (props.fontSize) {
        font += `${props.fontSize}px `;
    } else {
        font += '16px ';
    }
    if (props.font) {
        font += props.font;
    } else {
        font += 'sans-serif';
    }
    return font;
}


/**
 * Determine if the properties have changed significantly.
 *
 * @param newProps new text wrapping properties
 * @param oldProps old text wrapping properties
 * @returns true iff the properties have changed in a way that makes re-wrapping text neccessary
 */
function propsHaveChanged(newProps: TextProperties, oldProps: TextProperties) {
    const mustMatch: (keyof TextProperties)[] = [
        'x',
        'y',
        'width',
        'height',
        'wrapLines',
        'centerY',
        'font',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'fontVariant',
        'lang',
        'overflowMode',
        'wordBreak',
    ];
    if (mustMatch.some(attr => newProps[attr] !== oldProps[attr])) {
        return true;
    }
    return false;
}

const sharedCanvas = new OffscreenCanvas(1, 1).getContext('2d');new OffscreenCanvas(1, 1).getContext('2d');
if (sharedCanvas == null) {
    console.error('Textwrapping relies on the OffscreenCanvas API, which is currently not available!');
}

const segmenterCache = new Map<string, Intl.Segmenter>();

/**
 * Get a segmenter from cache or create a new one.
 *
 * @param lang the language for the segmenter
 * @param granularity the desired segment granularity
 * @returns a segmenter
 */
function getSegmenter(lang: string|undefined, granularity: 'grapheme'|'word') {
    const key = `${granularity}__${lang}`;
    let segmenter = segmenterCache.get(key);
    if (segmenter != null) {
        segmenterCache.delete(key); // delete and reinsert later to move key to latest position
    } else {
        segmenter = new Intl.Segmenter(lang, {granularity: granularity});
    }
    segmenterCache.set(key, segmenter);

    if (segmenterCache.size > 20) { // keep up to 20 segmenters
        const oldestKey = segmenterCache.keys().next()
        if (!oldestKey.done && oldestKey.value != null) {
            segmenterCache.delete(oldestKey.value);
        }
    }

    return segmenter;
}

/** Cache for the last used text wrapping properties by text element. */
const textCache: WeakMap<SVGTextElement|SVGTSpanElement, TextProperties> = new WeakMap();

/**
 * Assert that a given value is a CSSUnitValue.
 *
 * @param val value to check
 */
function assertIsCSSUnitValue(val: CSSStyleValue): asserts val is CSSUnitValue {
    if (typeof val !== 'object') {
        throw new Error('Not an object!');
    }
    if ((val as any).value == null || (val as any).unit == null) {
        throw new Error('Not a CSSUnitValue!');
    }
}

/**
 * Update the lang attribute of the given text properties.
 *
 * @param text the text element to get the language from
 * @param props the text properties to update
 * @returns the text properties
 */
function updateLang(text: SVGTextElement, props: TextProperties) {
    let currentElement: Element|null = text;
    while (currentElement != null) {
        if (Object.hasOwn(currentElement, 'lang')) {
            const lang = (currentElement as any).lang;
            if (typeof lang === 'string') {
                props.lang = lang;
            } else {
                props.lang = undefined;
            }
            return props;
        }
        currentElement = currentElement.parentElement;
    }
    return props
}

/**
 * Get a px unit number for the given style attribute.
 *
 * @param style the style attribute to get
 * @param styleMap the new style css map
 * @param oldStyleDeclaration the old computed style css map
 * @returns a number in px units or none
 */
function getStylePxValue(style: string, styleMap: StylePropertyMapReadOnly|null, oldStyleDeclaration: CSSStyleDeclaration|null): number|null {
    if (styleMap != null) {
        const value = styleMap.get(style);
        if (value == null) {
            return null;
        }
        assertIsCSSUnitValue(value);
        if (value.unit === 'px') {
            return value.value;
        }
    }
    if (oldStyleDeclaration != null) {
        const value = oldStyleDeclaration.getPropertyValue(style)?.toLowerCase();
        if (value === '') {
            return null;
        }
        const parser = /^\s*(?<value>[0-9.]*)\s*(?<unit>px)\s*$/
        const parts = parser.exec(value);
        if (parts == null) {
            throw Error(`Unable to parse "${value}" as a pixel value.`);
        }
        if (parts[2] === "px") {
            return parseFloat(parts[1]);
        }
    }
    throw Error('Unable to determine style values, either styleMap, or oldStyleDeclaration must be provided.');
}

/**
 * Get a string value for a given style attribute.
 *
 * @param style the style attribute to get
 * @param styleMap the new style css map
 * @param oldStyleDeclaration the old computed style css map
 * @returns the string value of the style attribute or `null`
 */
function getStyleStringValue(style: string, styleMap: StylePropertyMapReadOnly|null, oldStyleDeclaration: CSSStyleDeclaration|null): string|null {
    if (styleMap != null) {
        const value = styleMap.get(style);
        return value?.toString() ?? null;
    }
    if (oldStyleDeclaration != null) {
        const value = oldStyleDeclaration.getPropertyValue(style);
        if (value === '') {
            return null;
        }
        return value;
    }
    throw Error('Unable to determine style values, either styleMap, or oldStyleDeclaration must be provided.');
}

/**
 * Get text properties for a given SVGTextElement.
 *
 * @param element the element to get the text properties for
 * @returns the built text properties
 */
export function getTextProperties(element: SVGTextElement): TextProperties|null {
    let styleMap: StylePropertyMapReadOnly|null = null;
    let oldStyleDeclaration: CSSStyleDeclaration|null = null;
    if (element.computedStyleMap != null) {
        styleMap = element.computedStyleMap();
    } else {
        oldStyleDeclaration = window.getComputedStyle(element);
    }
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

    // parse vertical text center
    const verticalCenter = text.attr('data-text-center-y');
    let centerY: number|null = null;
    if (verticalCenter != null) {
        centerY = parseFloat(verticalCenter);
    }
    if (centerY != null && isNaN(centerY)) {
        centerY = null;
    }
    const isCenteredVertically = centerY != null;

    if (isCenteredVertically) {
        props.centerY = centerY as number;
    }

    // get overflowMode from css style attribute
    let overflowMode = getStyleStringValue('text-overflow', styleMap, oldStyleDeclaration);
    if (overflowMode == null) {
        overflowMode = 'ellipsis';
    }
    props.overflowMode = overflowMode;

    // get wordBreak from css style attribute
    let wordBreak = getStyleStringValue('word-break', styleMap, oldStyleDeclaration);
    if (wordBreak == null) {
        wordBreak = 'break-word';
    }
    props.wordBreak = wordBreak;

    // get font specifics from css
    const fontFamily = getStyleStringValue('font-family', styleMap, oldStyleDeclaration) ?? undefined;
    const fontSize = getStylePxValue('font-size', styleMap, oldStyleDeclaration);
    const fontWeight = getStyleStringValue('font-weight', styleMap, oldStyleDeclaration) ?? undefined;
    const fontVariant = getStyleStringValue('font-variant', styleMap, oldStyleDeclaration) ?? undefined;
    const fontStyle = getStyleStringValue('font-style', styleMap, oldStyleDeclaration) ?? undefined;

    props.font = fontFamily;

    if (fontSize != null && !isNaN(fontSize)) {
        props.fontSize = fontSize;
    }

    props.fontWeight = fontWeight;
    props.fontVariant = fontVariant;
    props.fontStyle = fontStyle;

    const fontString = textPropertiesToFont(props);
    if (props.textCache == null || props.textCache.font !== fontString) {
        props.textCache = {
            font: fontString,
            measurements: new Map(),
        };
    }
    updateLang(element, props);
    return props;
}

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
    const props = getTextProperties(element);
    if (props == null) {
        return;
    }

    const hasNoWidth = props.width == null || isNaN(props.width)

    if (sharedCanvas == null || (hasNoWidth && props.wrapLines == null)) {
        // no text wrapping possible (missing information)
        text.selectAll('tspan').remove(); // clear previous dom content
        text.text(newText);
        textCache.delete(text.node() as SVGTextElement); // clear all properties
        return;
    }

    const oldProps = textCache.get(text.node() as SVGTextElement);
    if (!force && oldProps != null && !propsHaveChanged(props, oldProps)) {
        if (oldProps.lastWrappedText && newText.startsWith(oldProps.lastWrappedText)) {
            if (oldProps.lastWrappedOverflow) {
                return; // text that may have changed is not shown visually
            }
            if (newText.length === oldProps.lastWrappedText.length) {
                return; // text is completely the same
            }
        }
    }

    if (props.wrapLines != null) {
        // handle special wrap lines!
        const def = wrapTextLines(text, newText, props, force);
        resetTextTransform(text, props, props.centerY != null);
        if (def.scale !== 1) {
            scaleText(text, def.scale);
        }
        const newY = centerTextVertically(text, props, true);
        if (newY != null) {
            props.y = newY;
        }
        textCache.set(text.node() as SVGTextElement, props);
        return;
    }

    if (props.height == null || isNaN(props.height)) {
        // no height => wrap a single line
        const unwrappedText = wrapSingleLine(element, props.width as number, newText, props, true, force);
        props.lastWrappedText = newText.substring(0, newText.length - unwrappedText.length);
        props.lastWrappedOverflow = lTrim(unwrappedText) !== '';
        resetTextTransform(text, props, props.centerY != null);
        const newY = centerTextVertically(text, props, false);
        if (newY != null) {
            props.y = newY;
        }
        textCache.set(text.node() as SVGTextElement, props);
        return;
    }

    // wrap multiline
    const spanSelection = calculateMultiline(text, props.height, props.x, props.y, force);
    const lines = spanSelection.nodes();
    let currentNewText = newText;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const isLastLine = index >= (lines.length - 1);
        const unwrappedText = wrapSingleLine(line, props.width as number, currentNewText, props, isLastLine, force);
        currentNewText = lTrim(unwrappedText);
        props.lastWrappedText = newText.substring(0, newText.length - unwrappedText.length);
        props.lastWrappedOverflow = currentNewText !== '';
    }
    resetTextTransform(text, props, props.centerY != null);
    const newY = centerTextVertically(text, props, true);
    if (newY != null) {
        props.y = newY;
    }
    textCache.set(text.node() as SVGTextElement, props);
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
 * Class to get text measurements without using dom APIs.
 */
class TextEval {
    private textCache: TextCache;
    private measureContext: OffscreenCanvasRenderingContext2D;
    private segmenter: Intl.Segmenter;
    private graphemeSegmenter: Intl.Segmenter;

    /**
     * Create a new evaluation object for wrapping text.
     *
     * @param props the text properties of the element to wrap text for
     */
    constructor (props: TextProperties) {
        if (props.textCache == null) {
            throw Error('Text properties need populated textCache!');
        }
        this.textCache = props.textCache;
        if (sharedCanvas == null) {
            throw Error('Failed to get measurement context for text wrapping.');
        }
        this.measureContext = sharedCanvas;
        let granularity: 'word'|'grapheme' = 'word';
        if (props.wordBreak === 'break-all') {
            granularity = 'grapheme';
        }
        this.segmenter = getSegmenter(props.lang, granularity);
        if (granularity === 'grapheme') {
            this.graphemeSegmenter = this.segmenter;
        } else {
            this.graphemeSegmenter = getSegmenter(props.lang, 'grapheme');
        }
    }

    /**
     * Get an estimated BBox of a text without calling dom API that cause layout calculations.
     *
     * This function does not use the cache.
     *
     * @param text the text to build the BBox for
     * @returns a bounding box that roughly matches the dom getBBox (but assumes origin at x=0 and y=0)
     */
    public measureBBoxOnce(text: string): Rect {
        this.measureContext.font = this.textCache.font;
        const data = this.measureContext.measureText(text);
        const height = Math.abs(data.fontBoundingBoxAscent) + Math.abs(data.fontBoundingBoxDescent);
        return {
            x: data.actualBoundingBoxLeft,
            y: -data.fontBoundingBoxAscent,
            width: data.width,
            height: height,
        }
    }

    /**
     * Get the width of a given text.
     *
     * This function does not use the cache.
     *
     * @param text the text to get the width for.
     * @returns the estimated width of the text
     */
    public measureWidthOnce(text: string): number {
        this.measureContext.font = this.textCache.font;
        return this.measureContext.measureText(text).width;
    }

    /**
     * Get the width of a given word or grapheme.
     *
     * @param text the text to get the width for.
     * @returns the estimated width of the text
     */
    public measureWidth(text: string): number {
        if (text === '') {
            return 0;
        }
        const cached = this.textCache.measurements.get(text);
        if (cached != null) {
            return cached;
        }
        const width = this.measureWidthOnce(text)
        this.textCache.measurements.set(text, width);
        return width;
    }

    /**
     * Get a segmenter to split a string into smaller segments for wrapping.
     *
     * @param wordBreak "break-word" | "break-all"
     * @returns a segmenter instance to split a string into smaller segments
     */
    public getSegmenter(wordBreak: string) {
        if (wordBreak === 'break-all') {
            return this.graphemeSegmenter;
        }
        return this.segmenter;
    }


    /**
     * Wrap single line of text based on current text properties.
     *
     * @param text the text to wrap in the line
     * @param width width of the line
     * @param overflowChar wrapping mode
     * @param wordBreak how words should be segmented for wrapping
     */
    public wrapText(text: string, width: number, overflowChar: string, wordBreak: string): {text: string, width: number, overflow: string} {
        if (text == null || text === '') {
            return {text: '', width: 0, overflow: ''};
        }
        let wrapped = '';
        const overflowCharWidth = this.measureWidth(overflowChar);
        let wrappedWidth = 0 + overflowCharWidth;

        const segmenter = this.getSegmenter(wordBreak);
        for (const segment of segmenter.segment(text)) {
            const segmentText = segment.segment;
            const segmentWidth = this.measureWidth(segmentText);
            if ((wrappedWidth + segmentWidth) > width) {
                if (wrappedWidth === 0) { // is first word/segment
                    if (wordBreak === 'break-all') { // already breaking up words
                        return {text: overflowChar, width: wrappedWidth, overflow: text};
                    } else { // try break up word
                        return this.wrapText(text, width, overflowChar, 'break-all');
                    }
                }
                return {text: wrapped+overflowChar, width: wrappedWidth, overflow: text.substring(wrapped.length)};
            }
            wrapped += segmentText;
            wrappedWidth += segmentWidth;
        }

        return {text: wrapped, width: wrappedWidth-overflowCharWidth, overflow: ''};
    }
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
    let maxHeight: number|null = props.height ?? null;
    if (maxHeight == null || isNaN(maxHeight)) {
        maxHeight = null;
    }
    if (props.wrapLines == null) {
        throw Error('Cannot wrap text in lines without line definitions!');
    }
    const textNode = text.node();
    if (textNode == null) {
        throw Error('Cannot render text into nonexistent element!');
    }
    const lineDefs = parseLineDefs(props.wrapLines);

    const oldProps = textCache.get(textNode);

    let lineheight = parseFloat(text.attr('data-lineheight'));
    if (force || isNaN(lineheight)) {
        lineheight = calculateLineHeight(text);
    }
    lineheight = Math.abs(lineheight); // don't allow negative lineheight
    props.lineheight = lineheight;

    // filter out line defs that lead to too long text
    const allowedLineDefs = lineDefs.filter((def, index) => index === 0 || maxHeight == null || (def.lineWidths.length * lineheight * def.scale) <= maxHeight);
    if (allowedLineDefs.length === 0) {
        throw Error(`No line wrapping definition found that is smaller than the max height ${maxHeight}. ${props.wrapLines}`);
    }

    const x = text.attr('x');
    const yBaseline = parseFloat(text.attr('y'));
    if (isNaN(yBaseline)) {
        throw Error(`Could not read attribute "y" of the text element! ${textNode}`);
    }

    const ctx = new TextEval(props);

    // calculate minimal length needed
    text.selectAll('tspan').remove();
    const minimalCumulativeLineLength = ctx.measureWidthOnce(newText);

    // check shortcuts based on older attempts
    let firstLineDefIndex = 0;
    if (
        oldProps != null
        && oldProps.wrapLines === props.wrapLines
        && oldProps.lineheight === props.lineheight
        && oldProps.lastWrappedText
        && newText.startsWith(oldProps.lastWrappedText)
        && oldProps.lastWrappedOverflow
        && oldProps.wrapLineDefIndex != null
        && allowedLineDefs.length > oldProps.wrapLineDefIndex
    ) {
        // found possible shortcut
        firstLineDefIndex = oldProps.wrapLineDefIndex;
    }

    let usedDef: LineWrappingDefinition = allowedLineDefs[firstLineDefIndex];
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
            const isLastLine = index >= (spans.length - 1);
            const lastWrappedText = wrapSingleLine(line, width, currentNewText, props, isLastLine, force);
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
 * Get an estimated bounding box for a text element without calling `getBBox()`.
 *
 * @param text the text element selection to estimate the bbox for
 * @param props the text properties for the element required for the text measurements
 * @returns an estimated bounding box or `null`
 */
function getTextBBox(text: Selection<SVGTextElement, unknown, null, undefined>, props: TextProperties): Rect|null {
    const textNode = text.node();
    if (textNode == null) {
        return null;  // cannot reset transform without a dom node to reset
    }
    const ctx = new TextEval(props);

    const spanSelection = text.selectAll('tspan');

    if (spanSelection.empty()) {
        const x = parseFloat(text.attr('x'));
        const y = parseFloat(text.attr('y'));
        const textBox = ctx.measureBBoxOnce(text.text());
        textBox.x += x;
        textBox.y += y;
        return textBox;
    }

    const boxes: Rect[] = [];
    spanSelection.each((_, index, nodes) => {
        const line = nodes[index] as unknown as SVGTSpanElement;
        if (line == null || line.textContent === '') {
            return;
        }
        const x = parseFloat(line.getAttribute("x") ?? '0');
        const y = parseFloat(line.getAttribute("y") ?? '0');
        const textBox = ctx.measureBBoxOnce(line.textContent);
        textBox.x += x;
        textBox.y += y;
        boxes.push(textBox);
    });

    if (boxes.length === 0) {
        // fallback to getBBox
        return textNode.getBBox();
    }
    if (boxes.length === 1) {
        return boxes[0];
    }

    const firstRect = boxes.pop() as Rect; // list must have at least one rect here
    return calculateBoundingRect(firstRect ,...boxes);
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
 * @param props the text properties of the text element
 * @param isVerticallyCentered if the text is vertically centered it should scale from/towards that center vertically
 */
export function resetTextTransform(text: Selection<SVGTextElement, unknown, null, undefined>, props: TextProperties, isVerticallyCentered: boolean= false) {
    const bbox = getTextBBox(text, props);
    if (bbox == null) {
        return;  // cannot reset transform without bounding box data
    }
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
 * @param props the text properties of the text element
 * @param multiline true if the text is a multiline text containing tSpans
 * @returns the new y coordinate set (if any)
 */
export function centerTextVertically(text: Selection<SVGTextElement, unknown, null, undefined>, props: TextProperties, multiline: boolean = false) {
    let centerY = props.centerY;
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
    const bbox = getTextBBox(text, props);
    if (textNode == null || bbox == null) {
        return;
    }
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
        lineheight = calculateLineHeight(text);  // FIXME update line height calculation
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
function calculateLineHeight(text: Selection<SVGTextElement, unknown, null, undefined>) { // FIXME use new text measurement approach for this
    let lineheight: number|null = null;
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
    if (lineheight == null || isNaN(lineheight)) {
        text.selectAll('tspan').remove(); // remove all child elements before calculation
        text.text('M'); // use M as measurement character.
        lineheight = text.node()?.getExtentOfChar(0)?.height ?? 15;
        text.text(null);
    }
    return lineheight;
}

/**
 * Wrap text in a single line and return the overflow.
 *
 * @param element element to wrap text into
 * @param width max linewidth for text
 * @param newText new text to set
 * @param props the text properties object associated with the element
 * @param isLastLine true if this line is the last line being wrapped
 * @param force force rewrap
 * @returns the overflow text
 */
// eslint-disable-next-line complexity
export function wrapSingleLine(
    element: SVGTextElement | SVGTSpanElement, width: number,
    newText: string, props: TextProperties,
    isLastLine: boolean, force: boolean = false,
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

    const ctx = new TextEval(props);
    const mode = (isLastLine ? props.overflowMode : 'clip') ?? 'clip';
    const wordBreak = (isLastLine ? 'break-all' : props.wordBreak) ?? 'break-word';
    const overflowChar = mode === 'clip' ? '' : '…';

    const result = ctx.wrapText(newText, width, overflowChar, wordBreak);
    text.text(result.text);
    return lTrim(result.overflow);
}
