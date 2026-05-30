-- for repository page
vim.api.nvim_set_keymap("n", "<Leader>gr", ":OpenInGHRepo <CR>", { silent = true, noremap = true })

-- for current file page
vim.api.nvim_set_keymap("n", "<Leader>gv", ":OpenInGHFile <CR>", { silent = true, noremap = true })
vim.api.nvim_set_keymap("v", "<Leader>gv", ":OpenInGHFileLines <CR>", { silent = true, noremap = true })
