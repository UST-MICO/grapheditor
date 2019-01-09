const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    entry: {
        "grapheditor-webcomponent": "./src/index.ts",
        //"grapheditor-webcomponent.min": "./src/index.ts",
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",

    resolve: {
        // Add '.ts' and '.tsx' as resolvable extensions.
        extensions: [".webpack.js", ".web.js", ".ts", ".js"]
    },

    /*
    optimization: {
        minimizer: [
            new TerserPlugin({
                cache: true,
                parallel: true,
                sourceMap: true,
                terserOptions: {
                    // https://github.com/webpack-contrib/terser-webpack-plugin#terseroptions
                }
            }),
        ],
    },
    */

    module: {
        rules: [
            {
                test: /\.[jt]s$/,
                use: [{
                    loader: "awesome-typescript-loader",
                    options: {
                      declaration: false,
                    }
                }],
                exclude: path.resolve(__dirname, "node_modules"),
            }
        ]
    },
    output: {
        path: path.resolve(__dirname, '_bundles'),
        filename: '[name].js',
        libraryTarget: 'umd',
        library: 'grapheditor-webcomponent',
        umdNamedDefine: true
    },
};
