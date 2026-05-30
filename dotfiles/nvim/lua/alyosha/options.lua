-- info
vim.o.number = true
vim.o.relativenumber = true
vim.o.showcmd = true
vim.o.ruler = true
vim.o.clipboard = "unnamedplus"
-- scrolling
vim.o.scrolloff = 7

-- tabbing
vim.o.tabstop = 4
vim.o.softtabstop = 4
vim.o.shiftwidth = 4
vim.o.expandtab = true
vim.o.autoindent = true
vim.o.smartindent = true
vim.o.backspace = "indent,eol,start"
vim.o.smarttab = true
vim.o.cindent = true
vim.cmd [[
    filetype indent on
]]
vim.o.lbr = true
vim.o.tw = 500

-- Set indentation for Terraform files to 2 spaces
vim.api.nvim_create_autocmd("FileType", {
  pattern = "terraform",
  callback = function()
    vim.bo.shiftwidth = 2
    vim.bo.tabstop = 2
    vim.bo.expandtab = true
  end,
})

-- buffers
vim.o.hidden = true
vim.o.title = true

-- highlighting & searching
vim.o.cursorline = true
vim.o.lazyredraw = false

-- search --
vim.o.ignorecase = true
vim.o.smartcase = true

-- appearance --
vim.o.termguicolors = true
vim.o.cmdheight = 0

-- comments
vim.opt.formatoptions:append("cro")

vim.opt.swapfile = false
--

-- to be moved ...

-- " JSON formatting shortcut
-- nmap =j :%!python -m json.tool<CR>
