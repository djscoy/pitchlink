const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => ({
  entry: {
    content: './src/content.tsx',
    background: './src/background/index.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new webpack.DefinePlugin({
      __API_BASE__: JSON.stringify(
        argv.mode === 'production'
          ? 'https://pitchlink-api-production.up.railway.app/api'
          : 'http://localhost:3001/api'
      ),
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/styles', to: '.', globOptions: { ignore: ['**/*.ts'] } },
        // InboxSDK pageWorld.js — must be in dist root for MV3 injection
        { from: '../../node_modules/@inboxsdk/core/pageWorld.js', to: 'pageWorld.js' },
      ],
    }),
  ],
  // InboxSDK needs this
  optimization: {
    splitChunks: false,
  },
  devtool: argv.mode === 'production' ? false : 'cheap-module-source-map',
});
