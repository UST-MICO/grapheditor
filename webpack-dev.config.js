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
    ],
    devServer: {
        contentBase: path.resolve(__dirname, '_bundles'),
        port: 9000
    },
});
