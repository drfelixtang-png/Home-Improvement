// Starter list: 77 items (61 food and water, 16 emergency supplies) for 5 people for 1 month. Loaded on first sign-in or from Settings.
export const STARTER_CSV = `sort_order,name_en,name_zh,target_qty,unit,location,category,notes,priority,stock_rule,kind,highlight_en,highlight_zh,step_qty
1,Hard liquor,烈酒,2,bottle,Kitchen,Drinks,,nice,keep,food,Keeps indefinitely; morale and trade value,可無限期存放；提振士氣，亦可作交換,1
2,Hard candy,硬糖,1,kg,Kitchen,Snacks,,nice,keep,food,Ready to eat; quick sugar boost; keeps for years,即食；快速補充糖分；可存放多年,1.3
3,Popcorn kernels,爆谷粟米粒,2,kg,Garage,Grains,,nice,keep,food,Needs heat to pop; whole-grain snack; keeps 2+ years,需加熱爆開；全穀物小食；可存放兩年以上,0.85
4,Green tea,綠茶,200,bag,Kitchen,Drinks,,nice,keep,food,Needs hot water; comforting drink; best within 2 years,需熱水沖泡；暖身飲品；兩年內最佳,100
5,Dark chocolate 70% / cocoa,70%黑朱古力／可可粉,1,kg,Kitchen,Snacks,,nice,no_overstock,food,Ready to eat; dense calories and morale; about 1 year,即食；高熱量，提振士氣；約可存放一年,0.3
6,Instant coffee,即溶咖啡,2,jar,Kitchen,Drinks,200 g jars,nice,keep,food,Needs hot water; prevents caffeine headaches; keeps 2+ years,需熱水沖泡；避免咖啡因戒斷頭痛；可存放兩年以上,1
7,Cornstarch,粟粉,1,kg,Kitchen,Baking,,nice,keep,food,Thickens soups and sauces; keeps indefinitely if dry,令湯及醬汁變稠；保持乾燥可無限期存放,1
8,Baking soda,梳打粉,2,box,Kitchen,Baking,,important,stock_up,food,"For baking, cleaning and odours; keeps indefinitely if dry",用於烘焙、清潔及除臭；保持乾燥可無限期存放,1
9,Pure vanilla extract,純雲呢拿香精,1,bottle,Kitchen,Baking,,nice,keep,food,Flavours baking and drinks; pure extract keeps indefinitely,為烘焙及飲品添香；純香精可無限期存放,1
10,Apple cider vinegar,蘋果醋,1,L,Kitchen,Seasonings,,nice,keep,food,Flavour and pickling; keeps for years,調味及醃漬；可存放多年,0.946
11,Distilled white vinegar,蒸餾白醋,4,L,Garage,Seasonings,Also for cleaning,important,stock_up,food,"Cleaning, pickling and cooking; keeps indefinitely",清潔、醃漬及烹調；可無限期存放,4
12,Dried herbs,乾香草,6,jar,Kitchen,Seasonings,,nice,keep,food,Makes plain staples tasty; best within 1 to 3 years,令簡單主食更美味；一至三年內最佳,1
13,Whole peppercorns,原粒胡椒,1,jar,Kitchen,Seasonings,,nice,keep,food,Whole pepper keeps its flavour 3+ years,原粒胡椒可保存香味三年以上,1
14,Soy sauce,豉油,2,L,Kitchen,Seasonings,,important,keep,food,Flavour and salt for rice and noodles; keeps 2+ years unopened,為飯麵調味及補充鹽分；未開封可存放兩年以上,1.2
15,Bouillon cubes,湯塊,2,box,Kitchen,Seasonings,,important,keep,food,Turns plain water into broth; best within 1 to 2 years,把清水變成湯；一至兩年內最佳,1
16,Salt,鹽,2,kg,Garage,Seasonings,,essential,stock_up,food,Essential mineral and for preserving food; keeps forever,必需礦物質，亦可醃製食物；永久保存,1
17,Blackstrap molasses,黑糖蜜,1,jar,Kitchen,Sweeteners,,nice,keep,food,Sweetener rich in iron; keeps for years,含豐富鐵質的甜味料；可存放多年,1
18,Pure maple syrup,純楓糖漿,1,L,Kitchen,Sweeteners,,nice,keep,food,Ready-to-use sweetener; keeps for years unopened,即用甜味料；未開封可存放多年,1
19,White sugar,白糖,4,kg,Garage,Sweeteners,,important,stock_up,food,Quick calories and for preserving; keeps forever if dry,快速補充熱量，亦可用作醃製；保持乾燥可永久保存,4
20,Raw honey,生蜂蜜,1,kg,Kitchen,Sweeteners,,important,stock_up,food,Ready to eat; quick energy; never spoils,即食；快速補充能量；永不變壞,1
21,Coconut oil,椰子油,2,L,Kitchen,Fats and oils,,important,keep,food,Calorie-dense fat for cooking; keeps about 2 years,高熱量烹調油脂；約可存放兩年,1.6
22,Ghee,酥油,1.5,kg,Kitchen,Fats and oils,Not regular butter,important,keep,food,Calorie-dense cooking fat; shelf stable about 1 year unopened,高熱量烹調油脂；未開封常溫約可存放一年,0.8
23,Canned meat,肉類罐頭,30,can,Garage,Proteins,,essential,stock_up,food,"Cooked, ready to eat; protein; keeps 2 to 5 years",已煮熟，即食；蛋白質；可存放二至五年,1
24,Nonfat powdered milk,脫脂奶粉,4,kg,Kitchen,Proteins,Nonfat keeps longer,important,keep,food,Mix with water; protein and calcium; keeps 2+ years,加水沖調；蛋白質及鈣質；可存放兩年以上,2.5
25,Dried lentils,乾扁豆,3,kg,Garage,Proteins,,essential,stock_up,food,Cooks in 20 minutes with no soaking; protein; keeps for years,無需浸泡，約二十分鐘煮熟；蛋白質；可存放多年,1.8
26,Dried beans,乾豆,5,kg,Garage,Proteins,,essential,stock_up,food,Needs soaking and long cooking; cheap protein; keeps for years,需浸泡及長時間烹煮；便宜的蛋白質；可存放多年,0.9
27,Hardtack bread,硬餅乾（壓縮乾糧）,2,box,Garage,Grains,,essential,keep,food,Ready to eat; no water or cooking needed; keeps 5+ years,即食；無需水或烹煮；可存放五年以上,1
28,Dried corn or cornmeal,乾粟米（或粟米粉）,1,kg,Garage,Grains,,important,keep,food,Needs cooking; quick porridge or bread; best within 1 year,需烹煮；可做粥或麵包；一年內最佳,2
29,Rolled oats,燕麥片,8,kg,Garage,Grains,,essential,stock_up,food,Soak or cook briefly; filling breakfast; keeps 2+ years,浸泡或稍煮即可；飽肚早餐；可存放兩年以上,1
30,Dry pasta,乾意大利麵,10,kg,Garage,Grains,,essential,stock_up,food,Needs boiling water; cheap calories; keeps 2+ years,需滾水烹煮；便宜的熱量來源；可存放兩年以上,2
31,White rice,白米,36,kg,Garage,Grains,Two 18 kg bags,essential,stock_up,food,Needs water and fuel; main source of calories; keeps for many years sealed,需水及燃料烹煮；主要熱量來源；密封可存放多年,8
32,Drinking water,飲用水,280,L,Garage,Water,Two weeks; 600 L for a full month,essential,keep,food,Top survival need: 4 L per person per day; rotate every 1 to 2 years,最重要的生存所需：每人每日四公升；每一至兩年更換,12
33,Water filter or purification tablets,濾水器／淨水藥片,1,each,Garage,Water,,essential,keep,emergency,Makes tap or rain water safe to drink; tablets keep about 5 years,令自來水或雨水可安全飲用；藥片約可存放五年,1
34,Canned fish,魚類罐頭,30,can,Garage,Proteins,,essential,stock_up,food,"Cooked, ready to eat; protein and omega-3; keeps 3+ years",已煮熟，即食；蛋白質及奧米加三；可存放三年以上,1
35,Canned vegetables,蔬菜罐頭,40,can,Garage,Fruit and vegetables,,important,stock_up,food,"Cooked, ready to eat; vitamins and fibre; keeps 2+ years",已煮熟，即食；維他命及纖維；可存放兩年以上,1
36,Canned tomatoes,番茄罐頭,15,can,Garage,Fruit and vegetables,,important,keep,food,Ready to use; vitamin C and flavour; best within 18 months,即用；維他命C及調味；十八個月內最佳,1
37,Canned fruit,水果罐頭,20,can,Garage,Fruit and vegetables,,important,keep,food,Ready to eat; vitamins and morale; keeps 1 to 2 years,即食；維他命，提振士氣；可存放一至兩年,1
38,Peanut butter,花生醬,4,jar,Kitchen,Proteins,1 kg jars,essential,keep,food,Ready to eat; calories and protein; keeps 1 to 2 years,即食；熱量及蛋白質；可存放一至兩年,1
39,Dried fruit,乾果,2,kg,Kitchen,Fruit and vegetables,,important,keep,food,Ready to eat; vitamins and natural sugar; about 1 year,即食；維他命及天然糖分；約可存放一年,1
40,Rice noodles / dried noodles,米粉／乾麵,5,kg,Garage,Grains,,important,keep,food,Soak or boil briefly; quick meal; keeps 2+ years,浸軟或稍煮即可；快捷一餐；可存放兩年以上,0.5
41,Dried shiitake mushrooms,乾冬菇,0.5,kg,Kitchen,Fruit and vegetables,,nice,keep,food,Soak before cooking; rich flavour; keeps 1 to 2 years,烹煮前需浸軟；味道濃郁；可存放一至兩年,0.2
42,Canned dace with black beans,豆豉鯪魚罐頭,10,can,Garage,Proteins,,important,keep,food,"Cooked, ready to eat; protein with flavour for rice; keeps 2+ years",已煮熟，即食；送飯的蛋白質；可存放兩年以上,1
43,White flour,白麵粉,5,kg,Garage,Baking,,important,keep,food,Needs baking; bread and pancakes; best within 1 year,需烘焙；做麵包及薄餅；一年內最佳,5
44,Instant yeast,即溶酵母,0.5,kg,Freezer,Baking,,nice,no_overstock,food,For bread; keeps up to 2 years in the freezer,做麵包用；冷藏可存放兩年,0.45
45,Baking powder,發粉,1,each,Kitchen,Baking,Loses strength after about 1 year,nice,no_overstock,food,For quick breads; loses strength after about 1 year,做快速麵包用；約一年後效力減弱,1
46,Vegetable or canola oil,菜油,3,L,Kitchen,Fats and oils,,important,keep,food,Calories and cooking; best within 1 year,熱量及烹調；一年內最佳,3
47,Electrolyte powder,電解質沖劑,30,pack,Kitchen,Health,,important,keep,food,Mix with water; treats dehydration from illness or heat; keeps about 2 years,加水沖調；應付因病或炎熱引致的脫水；約可存放兩年,30
48,Multivitamins,綜合維他命,2,bottle,Kitchen,Health,About 120 tablets per bottle; 1 tablet per person per day,important,keep,food,Fills gaps in a limited diet; check the expiry date,補充有限飲食缺少的營養；留意到期日,1
49,Manual can opener,手動開罐器,2,each,Kitchen,Supplies,,essential,keep,emergency,Without it canned food is hard to open; lasts for years,沒有它便難以開罐頭；可用多年,1
50,Camping stove and fuel,露營爐及燃料,1,each,Garage,Supplies,Fuel for 30 days; store fuel away from the house door,essential,keep,emergency,Cooks rice and beans and boils water; use outdoors only,可煮飯、煮豆及煲水；只可在戶外使用,1
51,Mylar bags and oxygen absorbers,密封袋及脫氧劑,20,pack,Garage,Supplies,,nice,keep,emergency,"Protects grains from air, light and pests for years",保護穀物免受空氣、光線及蟲害，可保存多年,10
52,Food-grade buckets with lids,食品級膠桶,8,each,Garage,Supplies,,nice,keep,emergency,Rodent-proof storage; also for water or an emergency toilet,防鼠儲物；亦可盛水或作應急廁所,3
53,First aid kit,急救包,1,each,Kitchen,Health,Check every 6 months and replace used or expired items,essential,keep,emergency,"Treat cuts, burns and sprains at home",在家處理割傷、燒傷及扭傷,1
54,Prescription medicines,處方藥物,5,pack,Kitchen,Health,One month supply for each person who takes regular medicine; rotate before expiry,essential,no_overstock,emergency,The hardest thing to replace in a disaster,災難時最難補充的物品,1
55,Flashlights or headlamps,電筒／頭燈,5,each,Kitchen,Lighting and power,One per person; headlamps keep hands free,essential,keep,emergency,Safe light in power outages; no fire risk like candles,停電時安全照明；沒有蠟燭的火災風險,1
56,Batteries (AA and AAA),電池（AA及AAA）,48,each,Kitchen,Lighting and power,,essential,stock_up,emergency,Power lights and radio; alkaline keeps about 10 years,為電筒及收音機供電；鹼性電池約可存放十年,12
57,Radio (battery or hand-crank),收音機（電池或手搖）,1,each,Kitchen,Lighting and power,,essential,keep,emergency,News and official instructions when phones are down,電話不通時收聽新聞及官方指示,1
58,Toilet paper,廁紙,40,each,Garage,Hygiene,Rolls,essential,stock_up,emergency,Hygiene and comfort; keeps indefinitely,衛生及舒適；可無限期存放,12
59,Bleach (unscented),漂白水（無香味）,2,L,Garage,Hygiene,"Unscented only; for water, about 2 drops per litre of clear water, wait 30 minutes",essential,no_overstock,emergency,Disinfects water and surfaces; loses strength after about 1 year,消毒食水及表面；約一年後效力減弱,1
60,Power banks,流動充電器（尿袋）,2,each,Kitchen,Lighting and power,Recharge every 3 months,important,keep,emergency,Keeps phones working for news and contact,保持手提電話可用，以接收消息及聯絡,1
61,Fire extinguisher (ABC),滅火筒（ABC）,1,each,Kitchen,Safety,Check the pressure gauge once a year,important,keep,emergency,Puts out small fires of all common types,撲滅各種常見的小型火警,1
62,N95 masks,N95口罩,1,box,Kitchen,Health,,important,keep,emergency,Filters dust after an earthquake and wildfire smoke,過濾地震後的塵埃及山火煙霧,1
63,Heavy-duty garbage bags,重型垃圾袋,50,each,Garage,Hygiene,,important,stock_up,emergency,"Waste, rain cover and emergency toilet liners",垃圾、防雨遮蓋及應急廁所膠袋,20
64,"Soap, toothpaste and hand sanitizer",肥皂、牙膏及搓手液,1,pack,Kitchen,Hygiene,"One month for 5 people: about 5 bars of soap, 3 tubes of toothpaste, 1 L of hand sanitizer",important,keep,emergency,Good hygiene prevents illness,保持衛生可預防疾病,1
65,Work gloves,工作手套,5,each,Garage,Tools,Pairs; buy sizes that fit each person,important,keep,emergency,Protects hands from broken glass and debris,保護雙手免被碎玻璃及雜物割傷,1
66,Lighters or waterproof matches,打火機／防水火柴,4,each,Kitchen,Tools,,important,keep,emergency,Lights the camping stove; matches as a backup,點燃露營爐；火柴作後備,1
67,Duct tape and plastic sheeting,強力膠紙及膠布,3,each,Garage,Tools,"2 rolls of duct tape, 1 plastic sheet",important,keep,emergency,"Quick repairs to windows, roofs and gear",快速修補窗戶、屋頂及用品,1
68,Copies of documents in a waterproof bag,證件副本（防水袋）,1,each,Kitchen,Safety,"ID, insurance, medical information and contact list; update once a year",important,keep,emergency,Proves identity and speeds up insurance claims,證明身份，加快保險索償,1
69,Canned chicken noodle soup,雞湯麵罐頭,20,can,Garage,Soups and ready meals,Condensed soup needs a can of water; ready-to-serve does not,important,stock_up,food,Cooked; comforting and easy on the stomach,已煮熟；暖胃易消化,1
70,Canned clam chowder,周打蜆湯罐頭,10,can,Garage,Soups and ready meals,,important,keep,food,Ready to serve; filling and creamy,即食；飽肚香濃,1
71,Canned beef stew,燉牛肉罐頭,15,can,Garage,Soups and ready meals,,important,stock_up,food,A full meal; can be eaten cold if needed,一罐就是一餐；有需要時可凍食,1
72,Canned chili with beans,辣肉醬豆罐頭,10,can,Garage,Soups and ready meals,,important,keep,food,Ready to eat; protein and calories in one can,即食；一罐有蛋白質及熱量,1
73,Canned baked beans,茄汁焗豆罐頭,15,can,Garage,Proteins,,important,stock_up,food,Ready to eat; protein and fibre,即食；蛋白質及纖維,1
74,Canned chickpeas,鷹嘴豆罐頭,10,can,Garage,Proteins,540 mL cans,important,stock_up,food,Cooked; no soaking or fuel needed,已煮熟；無需浸泡或燃料,1
75,Evaporated milk,淡奶,10,can,Kitchen,Proteins,,nice,no_overstock,food,For tea and cooking; best within about 1 year,用於沖茶及烹調；約一年內最佳,1
76,Canned mixed grain congee,八寶粥罐頭,12,can,Garage,Soups and ready meals,,nice,keep,food,Sweet and ready to eat; easy breakfast,甜味即食；方便早餐,6
77,Preserved mustard tuber (zha cai),榨菜,6,can,Kitchen,Seasonings,,nice,keep,food,Salty pickle that makes plain rice and congee tasty,鹹香醃菜，令白飯及粥更美味,1`
