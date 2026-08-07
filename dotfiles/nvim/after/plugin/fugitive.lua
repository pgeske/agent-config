local function pr_base_ref()
  local base = vim.fn.systemlist("gh pr view --json baseRefName --jq .baseRefName 2>/dev/null")[1]
  if vim.v.shell_error == 0 and base ~= nil and base ~= "" then
    return "origin/" .. base
  end

  base = vim.fn.systemlist("git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null")[1]
  if vim.v.shell_error == 0 and base ~= nil and base ~= "" then
    return base
  end

  return "origin/main"
end

local function diff_with_pr_base()
  vim.cmd("Gvdiffsplit " .. pr_base_ref())
end

local function pr_file_structure()
  local base = pr_base_ref()
  local diff_lines = vim.fn.systemlist("git diff --name-status -M " .. vim.fn.shellescape(base) .. "...HEAD")
  if vim.v.shell_error ~= 0 then
    vim.notify("Failed to load changed files against " .. base, vim.log.levels.ERROR)
    return
  end
  if #diff_lines == 0 then
    vim.notify("No changed files found against " .. base, vim.log.levels.INFO)
    return
  end

  local groups = {
    { title = "Added", files = {} },
    { title = "Modified", files = {} },
    { title = "Deleted", files = {} },
    { title = "Renamed", files = {} },
    { title = "Other", files = {} },
  }
  local group_by_status = { A = groups[1], M = groups[2], D = groups[3], R = groups[4], C = groups[4] }

  for _, line in ipairs(diff_lines) do
    local parts = vim.split(line, "\t", { plain = true })
    local status = parts[1] or ""
    local status_key = status:sub(1, 1)
    local group = group_by_status[status_key] or groups[5]
    local display
    local path

    if status_key == "R" or status_key == "C" then
      path = parts[3]
      display = string.format("  %s %s -> %s", status, parts[2] or "", parts[3] or "")
    else
      path = parts[2]
      display = string.format("  %s %s", status, path or "")
    end

    table.insert(group.files, { display = display, path = path })
  end

  local bufnr = vim.api.nvim_create_buf(false, true)
  local lines = { "PR file structure", "Base: " .. base, "" }
  local file_by_line = {}

  for _, group in ipairs(groups) do
    if #group.files > 0 then
      table.insert(lines, group.title)
      for _, file in ipairs(group.files) do
        table.insert(lines, file.display)
        file_by_line[#lines] = file.path
      end
      table.insert(lines, "")
    end
  end

  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  vim.bo[bufnr].buftype = "nofile"
  vim.bo[bufnr].bufhidden = "wipe"
  vim.bo[bufnr].swapfile = false
  vim.bo[bufnr].modifiable = false
  vim.bo[bufnr].filetype = "git"
  vim.api.nvim_buf_set_name(bufnr, "PR file structure")

  vim.cmd("botright 14split")
  vim.api.nvim_win_set_buf(0, bufnr)

  vim.keymap.set("n", "<CR>", function()
    local line = vim.api.nvim_win_get_cursor(0)[1]
    local path = file_by_line[line]
    if path == nil or path == "" then
      return
    end
    vim.cmd("edit " .. vim.fn.fnameescape(path))
  end, { buffer = bufnr, desc = "Open PR file" })
end

vim.keymap.set("n", "<leader>gs", ":Git<CR>", { noremap = true })
vim.keymap.set("n", "<leader>gd", diff_with_pr_base, { desc = "Git diff against PR base" })
vim.keymap.set("n", "<leader>gw", ":Gvdiffsplit<CR>", { desc = "Git diff against working tree" })
vim.keymap.set("n", "<leader>ga", pr_file_structure, { desc = "View PR file structure" })
vim.keymap.set("n", "<leader>gb", ":Git blame<CR>")
vim.keymap.set("n", "<leader>gl", ":Git log<CR>")
vim.keymap.set("n", "<leader>gf", ":Git fetch --all<CR>", { silent = true })
