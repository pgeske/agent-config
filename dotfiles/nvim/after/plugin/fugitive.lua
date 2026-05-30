
vim.keymap.set("n", "<leader>gs", ":Git<CR>", { noremap = true })
vim.keymap.set("n", "<leader>gd", ":Gvdiffsplit<CR>")
vim.keymap.set("n", "<leader>gb", ":Git blame<CR>")
vim.keymap.set("n", "<leader>gl", ":Git log<CR>")
vim.keymap.set("n", "<leader>gph", ":Git push origin HEAD<CR>")
vim.keymap.set("n", "<leader>gf", ":Git fetch --all<CR>", { silent = true })
