require('@babel/register')({
    extensions: ['.js'],
    ignore: [/node_modules/],
    plugins: [
        '@babel/plugin-transform-optional-chaining',
        '@babel/plugin-transform-nullish-coalescing-operator',
    ],
});

require('./server/src/server').start().catch(error => {
    console.error('Backend service failed to start:', error);
    process.exit(1);
});
