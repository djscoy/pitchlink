const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
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
  devtool: 'cheap-module-source-map',
};
