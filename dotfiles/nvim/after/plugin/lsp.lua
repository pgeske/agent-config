-- https://lsp-zero.netlify.app/v3.x/tutorial.html#setup-lsp-zero

-- LSP Zero Setup
local lsp_zero = require("lsp-zero")
local function lsp_on_attach(_, bufnr)
  -- see :help lsp-zero-keybindings
  lsp_zero.default_keymaps({buffer = bufnr})
  vim.keymap.set("n", "<leader>gr", vim.lsp.buf.references, {buffer = bufnr, desc = "Go to references"})
  -- format the buffer
  vim.keymap.set({ "n", "x" }, "<C-l>", function()
	  vim.lsp.buf.format({ async = false, timeout_ms = 10000 })
  end, {buffer = bufnr})

end

lsp_zero.on_attach(lsp_on_attach)


-- Mason Setup (LSP Installation)
require("mason").setup({})
require("mason-lspconfig").setup({
  ensure_installed = { "gopls" },
  handlers = {
    lsp_zero.default_setup,
  },
})

-- Rust Tools Setup (Language Specific LSP Setup)
local rust_tools = require("rust-tools")
rust_tools.setup({
  server = {
    on_attach = function(client, bufnr)
      lsp_on_attach(client, bufnr)
      vim.keymap.set("n", "<leader>ca", rust_tools.hover_actions.hover_actions, {buffer = bufnr})
    end,
    settings = {
      ["rust-analyzer"] = {
        checkOnSave = {
          command = "clippy",
        },
      },
    },
  }
})

-- Auto-Completion Setup
local cmp = require("cmp")
local cmp_action = require("lsp-zero").cmp_action()
cmp.setup({
	mapping = cmp.mapping.preset.insert({
		["<Enter>"] = cmp.mapping.confirm({select = true}),

		-- Ctrl+Space to trigger completion menu
		["<C-Space>"] = cmp.mapping.complete(),

		-- Navigate between snippet placeholder
		["<C-f>"] = cmp_action.luasnip_jump_forward(),
		["<C-b>"] = cmp_action.luasnip_jump_backward(),

		-- Scroll up and down in the completion documentation
		["<C-u>"] = cmp.mapping.scroll_docs(-4),
		["<C-d>"] = cmp.mapping.scroll_docs(4),
	}),
	window = {
		completion = cmp.config.window.bordered(),
		documentation = cmp.config.window.bordered(),
	},
	formatting = {
		fields = {"menu", "abbr", "kind"},
		format = function(entry, item)
			local menu_icon ={
				nvim_lsp = "λ",
				vsnip = "⋗",
				buffer = "Ω",
				path = "🖫",
			}
			item.menu = menu_icon[entry.source.name]
			return item
		end,
	},
})

-- Terraform Setup --
require'lspconfig'.terraformls.setup{}
vim.api.nvim_create_autocmd({"BufWritePre"}, {
  pattern = {"*.tf", "*.tfvars"},
  callback = function()
    vim.lsp.buf.format()
  end,
})
