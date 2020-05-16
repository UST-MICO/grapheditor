const merge = require('webpack-merge');
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
        }),
        new HtmlWebpackPlugin({
            filename: 'groups.html',
            template: 'example/test-groups.html',
            hash: true,
            inject: 'head',
        }),
        new HtmlWebpackPlugin({
            filename: 'groups-drag-and-drop.html',
            template: 'example/test-groups-drag-and-drop.html',
            hash: true,
            inject: 'head',
        }),
        new HtmlWebpackPlugin({
            filename: 'resize.html',
            template: 'example/test-resize.html',
            hash: true,
            inject: 'head',
        }),
    ],
    devServer: {
        contentBase: path.resolve(__dirname, '_bundles'),
        port: 9009
    },
});
