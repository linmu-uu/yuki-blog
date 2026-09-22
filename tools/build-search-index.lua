-- 用 Lua 给博客生成站内搜索索引
--
-- 干什么：扫 src/content/posts 下的所有 Markdown，读出 front-matter，
--         去掉 Markdown 标记，输出一份 public/search-index.json 给前端搜索用。
--
-- 用法：lua tools/build-search-index.lua
--       （项目里也配了 npm run search:index）

local POSTS_DIR = "src/content/posts"
local OUT_FILE = "public/search-index.json"
local MAX_TEXT = 2000 -- 每篇正文截断长度，索引别太大

--------------------------------------------------------------------------
-- 1. 列目录：Lua 标准库没有这个能力，借一下 shell
--------------------------------------------------------------------------

local function list_markdown_files(dir)
	local is_windows = package.config:sub(1, 1) == "\\"
	local command

	if is_windows then
		command = string.format('dir /b "%s\\*.md"', dir)
	else
		command = string.format("ls -1 '%s'/*.md 2>/dev/null", dir)
	end

	local files = {}
	local pipe = io.popen(command)
	if not pipe then
		return files
	end

	for line in pipe:lines() do
		line = line:gsub("%s+$", "")
		if line ~= "" then
			table.insert(files, dir .. "/" .. line)
		end
	end
	pipe:close()

	table.sort(files)
	return files
end

local function read_file(path)
	local file = io.open(path, "rb")
	if not file then
		return nil
	end
	local content = file:read("a")
	file:close()
	return content
end

--------------------------------------------------------------------------
-- 2. 解析 front-matter（只处理我们这个博客用到的几种写法）
--------------------------------------------------------------------------

-- YAML 里 # 后面是注释，但引号里的 # 是正文的一部分
local function clean_value(value)
	value = value or ""
	-- 注意：match 有多个捕获时会返回多个值，这里必须把两个都接住，
	-- 只写 local quoted = ... 拿到的是第一个捕获（引号本身）。
	local _, inner = value:match("^%s*([\"'])(.-)%1%s*$")
	if inner then
		return inner
	end
	return (value:gsub("%s+#.*$", ""))
end

local function parse_tags(value)
	local tags = {}
	value = clean_value(value or "")

	-- 全角逗号先换成半角：Lua 的字符类是按字节匹配的，
	-- 把「，」写进 [^,，] 会让它的每个字节都变成分隔符，中文会被切碎。
	value = value:gsub("，", ",")

	for tag in value:gmatch("[^,]+") do
		tag = tag:gsub("^%s*%[?", ""):gsub("%]?%s*$", "")
		if tag ~= "" then
			table.insert(tags, tag)
		end
	end

	return tags
end

local function parse_front_matter(text)
	local meta = {}
	local head, body = text:match("^%-%-%-\r?\n(.-)\r?\n%-%-%-\r?\n(.*)$")

	if not head then
		return meta, text
	end

	for line in head:gmatch("[^\r\n]+") do
		local key, value = line:match("^([%w_%-]+):%s*(.-)%s*$")
		if key then
			meta[key] = value
		end
	end

	return meta, body
end

--------------------------------------------------------------------------
-- 3. 把 Markdown 变成适合搜索的纯文本
--------------------------------------------------------------------------

local function strip_markdown(text)
	local lines = {}
	local in_code = false

	for line in text:gmatch("[^\r\n]+") do
		if line:match("^%s*```") then
			in_code = not in_code -- 代码块整体跳过
		elseif not in_code then
			line = line:gsub("^%s*>%s?", "")          -- 引用
			line = line:gsub("^%s*#+%s*", "")         -- 标题
			line = line:gsub("^%s*[%-%*%+]%s+", "")   -- 无序列表
			line = line:gsub("^%s*%d+%.%s+", "")      -- 有序列表
			line = line:gsub("!%[[^%]]*%]%([^%)]*%)", " ") -- 图片
			line = line:gsub("%[([^%]]*)%]%([^%)]*%)", "%1") -- 链接只留文字
			line = line:gsub("[%*_`]", "")            -- 强调符号
			line = line:gsub("|", " ")                -- 表格竖线
			line = line:gsub("^%s*%-%-%-+%s*$", "")   -- 分隔线

			if line:match("%S") then
				table.insert(lines, line)
			end
		end
	end

	return table.concat(lines, " ")
end

--------------------------------------------------------------------------
-- 4. 手写 JSON：转义规则是这一步唯一容易出错的地方
--------------------------------------------------------------------------

local ESCAPES = {
	['"'] = '\\"',
	["\\"] = "\\\\",
	["\b"] = "\\b",
	["\f"] = "\\f",
	["\n"] = "\\n",
	["\r"] = "\\r",
	["\t"] = "\\t",
}

local function json_escape(text)
	return (text:gsub('[%c"\\]', function(char)
		return ESCAPES[char] or string.format("\\u%04x", char:byte())
	end))
end

local function json_string(text)
	return '"' .. json_escape(text) .. '"'
end

local function json_array(list)
	local parts = {}
	for _, item in ipairs(list) do
		table.insert(parts, json_string(item))
	end
	return "[" .. table.concat(parts, ", ") .. "]"
end

--------------------------------------------------------------------------
-- 5. 主流程
--------------------------------------------------------------------------

local entries = {}
local total_chars = 0

for _, path in ipairs(list_markdown_files(POSTS_DIR)) do
	local text = read_file(path)
	local slug = path:match("([^/\\]+)%.md$")

	if text and slug then
		local meta, body = parse_front_matter(text)
		local plain = strip_markdown(body)
		total_chars = total_chars + #plain

		table.insert(entries, {
			title = clean_value(meta.title) ~= "" and clean_value(meta.title) or slug,
			url = "/posts/" .. slug .. "/",
			date = clean_value(meta.published),
			category = clean_value(meta.category),
			description = clean_value(meta.description),
			tags = parse_tags(meta.tags),
			text = plain:sub(1, MAX_TEXT),
			chars = #plain,
		})

		print(string.format(
			"  %-22s %5d 字  %s",
			slug,
			#plain,
			table.concat(parse_tags(meta.tags), " / ")
		))
	end
end

-- 新文章排前面
table.sort(entries, function(a, b)
	return a.date > b.date
end)

local lines = {}
table.insert(lines, "{")
table.insert(lines, string.format('  "generatedAt": %s,', json_string(os.date("!%Y-%m-%dT%H:%M:%SZ"))))
table.insert(lines, string.format('  "count": %d,', #entries))
table.insert(lines, '  "posts": [')

for index, entry in ipairs(entries) do
	local comma = index < #entries and "," or ""
	table.insert(lines, "    {")
	table.insert(lines, string.format("      \"title\": %s,", json_string(entry.title)))
	table.insert(lines, string.format("      \"url\": %s,", json_string(entry.url)))
	table.insert(lines, string.format("      \"date\": %s,", json_string(entry.date)))
	table.insert(lines, string.format("      \"category\": %s,", json_string(entry.category)))
	table.insert(lines, string.format("      \"description\": %s,", json_string(entry.description)))
	table.insert(lines, string.format("      \"tags\": %s,", json_array(entry.tags)))
	table.insert(lines, string.format("      \"chars\": %d,", entry.chars))
	table.insert(lines, string.format("      \"text\": %s", json_string(entry.text)))
	table.insert(lines, "    }" .. comma)
end

table.insert(lines, "  ]")
table.insert(lines, "}")

local out = io.open(OUT_FILE, "wb")
if not out then
	io.stderr:write("写不了文件：" .. OUT_FILE .. "\n")
	os.exit(1)
end

out:write(table.concat(lines, "\n") .. "\n")
out:close()

print("")
print(string.format("共 %d 篇文章，%d 字，已写入 %s", #entries, total_chars, OUT_FILE))
