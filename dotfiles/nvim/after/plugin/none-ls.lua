local nls = require("null-ls") -- None-ls reuses null-ls API.

nls.setup({
    sources = {
        nls.builtins.formatting.black,
        nls.builtins.formatting.gofumpt,
        nls.builtins.formatting.goimports,
    },
})
