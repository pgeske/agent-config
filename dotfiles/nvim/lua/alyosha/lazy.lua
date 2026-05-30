local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
    vim.fn.system({
        "git",
        "clone",
        "--filter=blob:none",
        "https://github.com/folke/lazy.nvim.git",
        "--branch=stable", -- latest stable release
        lazypath,
    })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
	-- Telescope Setup
    { 'nvim-telescope/telescope-ui-select.nvim' },
    { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make', enabled = vim.fn.executable('make') == 1 },
    { "nvim-telescope/telescope.nvim",   tag = "0.1.8",    dependencies = { "nvim-lua/plenary.nvim" } },
    { "nvim-treesitter/nvim-treesitter", run = ":TSUpdate" },
    { "nvim-treesitter/playground" },
    { "tpope/vim-fugitive",              lazy = false },
    { "tpope/vim-commentary" },
    -- LSP Installation
    { "williamboman/mason.nvim", lazy =  false},
    { "williamboman/mason-lspconfig.nvim" },
    -- LSP Setup
    {
        "VonHeikemen/lsp-zero.nvim",
        branch = "v3.x",
        lazy = true,
        config = false,
    },
    -- LSP Auto-Completion
    {
        'neovim/nvim-lspconfig',
        dependencies = {
            {'hrsh7th/cmp-nvim-lsp'},
        }
    },
    {
        'hrsh7th/nvim-cmp',
        dependencies = {
            {'L3MON4D3/LuaSnip'}
        },
    },
    -- LSP Actions
    {
        "nvimtools/none-ls.nvim",
        dependencies = { "nvim-lua/plenary.nvim" },
    },
    -- Language Specific LSP Setup
    { "simrat39/rust-tools.nvim" },
    {
        "nvim-tree/nvim-tree.lua",
        branch = vim.fn.has("nvim-0.10") == 1 and "master" or "compat-nvim-0.9",
        lazy = false,
        dependencies = {
            "nvim-tree/nvim-web-devicons",
        },
        config = function()
            require("nvim-tree").setup {}
        end,
    },
    {
        "olimorris/onedarkpro.nvim",
        priority = 1000 -- Ensure it loads first
    },
    {
        "Mofiqul/dracula.nvim",
        priority = 1000 -- Ensure it loads first
    },
    { "shaunsingh/nord.nvim" },
    { "nvim-lualine/lualine.nvim", requires = { "nvim-tree/nvim-web-devicons", opt = true } },
    {
        "akinsho/bufferline.nvim",
        lazy = false,
        version = "*",
        dependencies =
        "nvim-tree/nvim-web-devicons"
    },
    {
        "folke/tokyonight.nvim",
        lazy = false,
        priority = 1000,
        opts = {},
    },
    -- {
    --     'glepnir/dashboard-nvim',
    --     event = 'VimEnter',
    --     config = function()
    --         require('dashboard').setup {
    --             -- config
    --         }
    --     end,
    --     dependencies = { { 'nvim-tree/nvim-web-devicons' } }
    -- },
    {
        "folke/trouble.nvim",
        opts = {}, -- for default options, refer to the configuration section for custom setup.
        cmd = "Trouble",
        keys = {
            {
                "<leader>xx",
                "<cmd>Trouble diagnostics toggle<cr>",
                desc = "Diagnostics (Trouble)",
            },
            {
                "<leader>xX",
                "<cmd>Trouble diagnostics toggle filter.buf=0<cr>",
                desc = "Buffer Diagnostics (Trouble)",
            },
            {
                "<leader>cs",
                "<cmd>Trouble symbols toggle focus=false<cr>",
                desc = "Symbols (Trouble)",
            },
            {
                "<leader>cl",
                "<cmd>Trouble lsp toggle focus=false win.position=right<cr>",
                desc = "LSP Definitions / references / ... (Trouble)",
            },
            {
                "<leader>xL",
                "<cmd>Trouble loclist toggle<cr>",
                desc = "Location List (Trouble)",
            },
            {
                "<leader>xQ",
                "<cmd>Trouble qflist toggle<cr>",
                desc = "Quickfix List (Trouble)",
            },
        },
    },
    {
        'windwp/nvim-autopairs',
        event = "InsertEnter",
        opts = {} -- this is equalent to setup({}) function
    },
    -- { "github/copilot.vim" },
    { "ojroques/nvim-osc52" },
    {
		"christoomey/vim-tmux-navigator",
		cmd = {
			"TmuxNavigateLeft",
			"TmuxNavigateDown",
			"TmuxNavigateUp",
			"TmuxNavigateRight",
			"TmuxNavigatePrevious",
		},
		keys = {
			{ "<c-h>", "<cmd><C-U>TmuxNavigateLeft<cr>" },
			{ "<c-j>", "<cmd><C-U>TmuxNavigateDown<cr>" },
			{ "<c-k>", "<cmd><C-U>TmuxNavigateUp<cr>" },
			{ "<c-l>", "<cmd><C-U>TmuxNavigateRight<cr>" },
			{ "<c-\\>", "<cmd><C-U>TmuxNavigatePrevious<cr>" },
		},
	},
	{ "romainl/vim-cool"},
    { "lukas-reineke/indent-blankline.nvim", main = "ibl", opts = {} },
    {
        "folke/zen-mode.nvim",
        opts = {
            -- your configuration comes here
            -- or leave it empty to use the default settings
            -- refer to the configuration section below
        }
    },
    { "almo7aya/openingh.nvim" },
    { "ellisonleao/gruvbox.nvim", priority = 1000 , config = true, opts = ...},
    { "catppuccin/nvim", name = "catppuccin", priority = 1000 },
})

vim.cmd("colorscheme catppuccin-frappe")

-- things that apparently need to be setup asap after install
require("bufferline").setup({})
