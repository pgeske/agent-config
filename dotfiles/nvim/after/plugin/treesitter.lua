local treesitter = require("nvim-treesitter")

local parsers = {
  "bash",
  "c",
  "diff",
  "go",
  "gomod",
  "gosum",
  "gowork",
  "javascript",
  "json",
  "lua",
  "markdown",
  "python",
  "query",
  "typescript",
  "vim",
  "vimdoc",
  "yaml",
}

treesitter.setup()
treesitter.install(parsers)

vim.api.nvim_create_autocmd("FileType", {
  pattern = parsers,
  callback = function()
    pcall(vim.treesitter.start)
  end,
})
