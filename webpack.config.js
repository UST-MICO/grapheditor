const path = require('path');

module.exports = {
    entry: {
        "grapheditor-webcomponent": "./src/index.ts",
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",

    resolve: {
        // Add '.ts' and '.tsx' as resolvable extensions.
        extensions: [".webpack.js", ".web.js", ".ts", ".js"]
    },

    module: {
        rules: [
            {
                test: /\.[jt]s$/,
                use: "ts-loader",
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
