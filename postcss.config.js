// const autoprefixer = require('autoprefixer')
const pxtorem = require('postcss-pxtorem')
const tailwindcss = require('@tailwindcss/postcss')

module.exports = {
  plugins: [
    // folia visual subsystem: Tailwind v4. Only folia/*.css imports it.
    tailwindcss(),
    pxtorem({
      rootValue: 16,
      unitPrecision: 5,
      propList: [
        'font', 'font-size',
        'letter-spacing',
        'padding', 'margin',
        'padding-*', 'margin-*',
        'height', 'width',
        '*-height', '*-width',
        'flex', '::-webkit-scrollbar',
        'top', 'left', 'bottom', 'right',
        'border-radius', 'gap',
      ],
      selectorBlackList: ['html', 'ignore-to-rem'],
      replace: true,
      mediaQuery: false,
      minPixelValue: 0,
      // folia keeps its px-based Folia layout verbatim
      exclude: [/node_modules/i, /[\\/]folia[\\/]/],
    }),
    // autoprefixer(),
  ],
}
