local builtin = require("telescope.builtin")

local telescope = require("telescope").setup({
	-- defaults = { sorting_strategy = "ascending" },
	extensions = {
		fzf = {
			fuzzy = true,                    -- false will only do exact matching
			override_generic_sorter = true,  -- override the generic sorter
			override_file_sorter = true,     -- override the file sorter
			case_mode = "smart_case",        -- or "ignore_case" or "respect_case"
			-- the default case_mode is "smart_case"
		},
		["ui-select"] = {
			require("telescope.themes").get_dropdown {
				-- even more opts
			}
		},
	}
})

-- keybinds
vim.keymap.set("n", "<C-p>", builtin.find_files, {})
vim.keymap.set("n", "<C-f>", builtin.live_grep, {})
vim.keymap.set("n", "<leader>ff", builtin.git_files, {})
vim.keymap.set("n", "<leader>fg", builtin.live_grep, {})
vim.keymap.set("n", "<leader>b", builtin.buffers, {})
vim.keymap.set("n", "<leader>fh", builtin.help_tags, {})
vim.keymap.set("n", "<leader>fc", builtin.colorscheme, {})
vim.keymap.set("n", "<leader>fd", builtin.current_buffer_fuzzy_find, {})
vim.keymap.set("n", "<leader>fgs", builtin.git_status, {})
vim.keymap.set("n", "<leader>ft", builtin.treesitter, {})
vim.keymap.set("n", "<leader>fgc", builtin.git_commits, {})

-- actions
local actions = require("telescope.actions")
require("telescope").setup({
	defaults = {
		mappings = {
			i = {
				["<esc>"] = actions.close,
			},
		},
	},
})

pcall(require("telescope").load_extension, "fzf")
require("telescope").load_extension("ui-select")
