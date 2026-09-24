import { defineConfig } from 'vite';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify as minifyHtml } from 'html-minifier-terser';

function obfuscatorPlugin() {
  return {
    name: 'vite-plugin-obfuscator',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, chunk) {
      if (chunk.fileName.endsWith('.js')) {
        const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.6,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.25,
          identifierNamesGenerator: 'hexadecimal',
          numbersToExpressions: true,
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 8,
          stringArray: true,
          stringArrayCallsTransform: true,
          stringArrayCallsTransformThreshold: 0.75,
          stringArrayEncoding: ['base64'],
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 2,
          stringArrayWrappersChainedCalls: true,
          stringArrayThreshold: 0.75,
          transformObjectKeys: true,
          selfDefending: true
        });
        return {
          code: obfuscationResult.getObfuscatedCode(),
          map: null
        };
      }
      return null;
    }
  };
}

function htmlMinifyPlugin() {
  return {
    name: 'vite-plugin-html-minify',
    apply: 'build',
    enforce: 'post',
    async transformIndexHtml(html) {
      return await minifyHtml(html, {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: true,
        minifyJS: true
      });
    }
  };
}

export default defineConfig({
  build: {
    minify: 'terser',
    sourcemap: false,
    cssMinify: true,
    terserOptions: {
      compress: {
        drop_debugger: true,
        passes: 2
      },
      mangle: {
        toplevel: true
      },
      format: {
        comments: false
      }
    }
  },
  plugins: [obfuscatorPlugin(), htmlMinifyPlugin()]
});
