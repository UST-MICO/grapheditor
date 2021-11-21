const { merge } = require('webpack-merge');
const common = require('./webpack.config.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = merge(common, {
    mode: 'development',

    plugins: [
        new HtmlWebpackPlugin({
            template: 'example/test.html',
            hash: true,
            inject: 'head',
            scriptLoading: 'blocking',
        }),
        new HtmlWebpackPlugin({
            filename: 'groups.html',
            template: 'example/test-groups.html',
            hash: true,
            inject: 'head',
            scriptLoading: 'blocking',
        }),
        new HtmlWebpackPlugin({
            filename: 'groups-drag-and-drop.html',
            template: 'example/test-groups-drag-and-drop.html',
            hash: true,
            inject: 'head',
            scriptLoading: 'blocking',
        }),
        new HtmlWebpackPlugin({
            filename: 'resize.html',
            template: 'example/test-resize.html',
            hash: true,
            inject: 'head',
            scriptLoading: 'blocking',
        }),
        new HtmlWebpackPlugin({
            filename: 'textwrap.html',
            template: 'example/test-textwrap.html',
            hash: true,
            inject: 'head',
            scriptLoading: 'blocking',
        }),
        new HtmlWebpackPlugin({
            filename: 'textwrap-performance.html',
            template: 'example/test-textwrap-performance.html',
            hash: true,
            inject: 'head',
            scriptLoading: 'blocking',
        }),
        new HtmlWebpackPlugin({
            filename: 'isolation.html',
            template: 'example/test-isolation.html',
            hash: true,
            inject: 'head',
            scriptLoading: 'blocking',
        }),
    ],
    devServer: {
        static: path.resolve(__dirname, '_bundles'),
        port: 9009
    },
});
