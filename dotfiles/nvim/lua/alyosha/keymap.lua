vim.g.mapleader = ","
vim.keymap.set("i", "jk", "<esc>")
vim.keymap.set("i", "<leader>s", "<ESC>:w<CR>", { noremap = true })
vim.keymap.set("n", "<leader>s", ":w<CR>", { noremap = true, silent = true })
-- close current buffer
vim.keymap.set("n", "<leader>q", ":bd<CR>", { noremap = true, silent = true })


vim.keymap.set("n", "<Tab>", ":bnext<CR>", { noremap = true, silent = true })
vim.keymap.set("n", "<S-Tab>", ":bprevious<CR>", { noremap = true, silent = true })
vim.keymap.set("n", "<space>", "/")
vim.keymap.set("n", "<C-space>", "?")

-- easier split pane navigation
vim.keymap.set("n", "<C-J>", "<C-W><C-J>", { noremap = true })
vim.keymap.set("n", "<C-K>", "<C-W><C-K>", { noremap = true })
vim.keymap.set("n", "<C-L>", "<C-W><C-L>", { noremap = true })
vim.keymap.set("n", "<C-H>", "<C-W><C-H>", { noremap = true })

-- jump to end of line and word easily
vim.keymap.set("i", "<leader>a", "<esc><S-A>", { noremap = true })
vim.keymap.set("i", "<leader>e", "<esc><S-E>", { noremap = true })
