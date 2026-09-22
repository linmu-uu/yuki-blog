---
title: Lua 入门：新手最容易踩的八个坑
published: 2026-09-22
description: "从 nil 与 false 的区别，到取长度、pairs 与 ipairs、元表、整数与浮点——把 Lua 新手最常翻车的几个点一次讲清楚，每条都配可运行示例。"
tags: [Lua, 编程, 踩坑]
category: 学习笔记
draft: false
---

Lua 是一门很小、很快、很容易嵌进别的程序的语言：几百 KB 的解释器，语法表一页纸就能写完。
游戏模组、网关配置（OpenResty）、Redis 脚本、编辑器插件都有它的身影。

也正是因为"小"，很多在其他语言里被语法强制约束的东西，在 Lua 里全靠自觉。
下面这八个坑，几乎是每个 Lua 新手都要踩一遍的。

## 一、只有 `nil` 和 `false` 是假

```lua
if 0 then print("0 是真") end        -- 会打印
if "" then print("空串是真") end      -- 会打印
print(0 == false)                    -- false
```

C 系语言里 `0` 是假，JavaScript 里 `""`、`0`、`NaN` 都是假，但 Lua 里**只有 `nil` 和 `false` 为假**。

这个特性在写"带默认值"的代码时特别容易翻车：

```lua
local function f(flag)
  flag = flag or true   -- 想给默认值？传进来 false 也会被改成 true
  return flag
end

print(f(false))  -- true，不是你想要的 false
```

正确写法是把判断写清楚：

```lua
local function f(flag)
  if flag == nil then flag = true end
  return flag
end
```

## 二、`#` 遇上"空洞"表，结果是未定义的

```lua
local t = { 1, 2, 3 }
print(#t)          -- 3，正常的数组

local hole = { 1, 2, nil, 4 }
print(#hole)       -- 可能是 4，也可能是 2，取决于实现
```

`#` 只对**连续序列**可靠。表里一旦出现 `nil`（"空洞"），长度就是未定义行为——
它可能返回边界中的任意一个，不同版本、不同插入顺序都可能不一样。

如果你的数据确实可能带空洞，用 `table.pack` 或者自己记个数：

```lua
local packed = table.pack(1, 2, nil, 4)
print(packed.n)    -- 4，明确记录了几个元素

for i = 1, packed.n do
  print(i, packed[i])   -- 第 3 个是 nil，也照样遍历得到
end
```

## 三、`ipairs` 会在第一个 `nil` 停下

```lua
local t = { "a", "b", nil, "d" }

for i, v in ipairs(t) do print("ipairs", i, v) end   -- 只输出 a、b
for k, v in pairs(t) do print("pairs", k, v) end     -- a、b、d 都会输出
```

`ipairs` 是"从 1 开始、遇到 `nil` 就停"；`pairs` 是遍历全部键值对，但**顺序不保证**。

所以：

- 想要数组顺序遍历、且数据一定连续 → `ipairs`
- 想遍历所有键（或者键不是数字） → `pairs`
- 想按顺序遍历但对空洞不放心 → 老老实实 `for i = 1, n do`

## 四、闭包捕获的是变量，不是值

先看一个"看起来会错、其实是对的"的例子：

```lua
local fns = {}
for i = 1, 3 do
  fns[i] = function() return i end
end

print(fns[1](), fns[2](), fns[3]())   -- 1  2  3
```

数值 `for` 的循环变量**每一轮都是新的局部变量**，所以三个闭包各自记住了自己的 `i`。

真正的坑在 `while`（或者你自己复用的变量）里：

```lua
local i = 1
local fns = {}
while i <= 3 do
  fns[i] = function() return i end
  i = i + 1
end

print(fns[1](), fns[2](), fns[3]())   -- 4  4  4
```

三个函数捕获的是**同一个** `i`，循环结束后它是 4。
要固定住当前值，就多套一层局部变量：

```lua
while i <= 3 do
  local current = i
  fns[current] = function() return current end
  i = i + 1
end
```

## 五、元表是 Lua 面向对象的全部

Lua 没有 `class`，对象靠**元表**（metatable）拼出来。最常见的组合是两个元方法：`__index` 和 `__newindex`。

```lua
local Stack = {}
Stack.__index = Stack

function Stack.new()
  return setmetatable({ items = {}, count = 0 }, Stack)
end

function Stack:push(value)
  self.count = self.count + 1
  self.items[self.count] = value
end

function Stack:pop()
  if self.count == 0 then return nil end
  local value = self.items[self.count]
  self.items[self.count] = nil
  self.count = self.count - 1
  return value
end

local s = Stack.new()
s:push("a")
s:push("b")
print(s:pop())   -- b
```

几个容易忘的点：

- `Stack.__index = Stack` 让实例找不到字段时去 `Stack` 里找方法——**忘了这行，方法就调不到**
- `s:push(x)` 是 `s.push(s, x)` 的语法糖，`self` 是第一个参数，所以定义时要写成 `function Stack:push()`
- `rawget` / `rawset` 可以绕过元表，调试时很有用

## 六、整数和浮点是两套类型

从 Lua 5.3 开始，数字分成 `integer` 和 `float` 两种子类型：

```lua
print(5 / 2)        -- 2.5   除法永远产生浮点
print(5 // 2)       -- 2     整除
print(5 % 2)        -- 1
print(math.type(3))   -- integer
print(math.type(3.0)) -- float
print(3 == 3.0)       -- true，比较时值相等就算相等
```

几个实际影响：

- 打印时 `3` 和 `3.0` 长得不一样（`tostring(3.0)` 是 `3.0`），日志里看到 `.0` 别慌
- 整数除法 `1 // 0` 会直接报错，而 `1 / 0` 是 `inf`
- 超过 64 位的整数运算会自动转成浮点，精度就丢了

## 七、错误处理要用 `pcall`，别指望 `try`

Lua 没有异常语法，出错靠返回值：

```lua
local ok, err = pcall(function()
  error("出事了")
end)

print(ok)    -- false
print(err)   -- 错误信息，形如 "chunk 名:行号: 出事了"
```

想在出错时做点收尾工作，用 `xpcall`：

```lua
local function handler(message)
  print("出错了：" .. tostring(message))
  return message
end

xpcall(function()
  local t = nil
  return t.value      -- 这里会报错
end, handler)
```

还有一个常被忽略的点：**`pcall` 只保护函数调用本身**，语法错误、栈溢出这类问题它兜不住。
而且 `pcall` 有开销，别在热循环里随手包一层。

## 八、字符串拼接和全局变量

两个都很容易悄悄拖慢程序：

```lua
-- 拼接：每轮都造一个新字符串，n 大起来是 O(n²)
local text = ""
for i = 1, 10000 do
  text = text .. i
end

-- 换成 table.concat，先把片段收起来，最后拼一次
local parts = {}
for i = 1, 10000 do
  parts[#parts + 1] = tostring(i)
end
local text2 = table.concat(parts)
```

```lua
-- 全局变量：忘了 local 就会往 _G 上写，模块之间互相污染
function greet()
  name = "yuki"    -- 少了 local，这是个全局变量
end

-- 改成
function greet()
  local name = "yuki"
end
```

`local` 还有一个额外好处：Lua 访问局部变量走的是寄存器，比全局（其实是查 `_ENV` 表）快得多。
热循环里把常用的全局函数先存成局部变量，是很常见的小优化：

```lua
local sqrt = math.sqrt
for i = 1, 1e6 do
  local _ = sqrt(i)
end
```

## 最后

这八条基本覆盖了新手写 Lua 时最容易"明明跑得动、结果不对"的场景。
如果你刚上手，建议养成两个习惯：

1. 变量一律先写 `local`
2. 表要么保证连续，要么老老实实记个数，别依赖 `#`

把这两条做到，Lua 用起来会顺手很多喵。
