// Starter list: 77 items (61 food and water, 16 emergency supplies) for 5 people for 1 month. Loaded on first sign-in or from Settings.
export const STARTER_CSV = `sort_order,name_en,name_zh,target_qty,unit,location,category,notes,priority,stock_rule,kind
1,Hard liquor,烈酒,2,bottle,Kitchen,Drinks,,nice,keep,food
2,Hard candy,硬糖,1,kg,Kitchen,Snacks,,nice,keep,food
3,Popcorn kernels,爆谷粟米粒,2,kg,Garage,Grains,,nice,keep,food
4,Green tea,綠茶,200,bag,Kitchen,Drinks,,nice,keep,food
5,Dark chocolate 70% / cocoa,70%黑朱古力／可可粉,1,kg,Kitchen,Snacks,,nice,no_overstock,food
6,Instant coffee,即溶咖啡,2,jar,Kitchen,Drinks,200 g jars,nice,keep,food
7,Cornstarch,粟粉,1,kg,Kitchen,Baking,,nice,keep,food
8,Baking soda,梳打粉,2,box,Kitchen,Baking,,important,stock_up,food
9,Pure vanilla extract,純雲呢拿香精,1,bottle,Kitchen,Baking,,nice,keep,food
10,Apple cider vinegar,蘋果醋,1,L,Kitchen,Seasonings,,nice,keep,food
11,Distilled white vinegar,蒸餾白醋,4,L,Garage,Seasonings,Also for cleaning,important,stock_up,food
12,Dried herbs,乾香草,6,jar,Kitchen,Seasonings,,nice,keep,food
13,Whole peppercorns,原粒胡椒,1,jar,Kitchen,Seasonings,,nice,keep,food
14,Soy sauce,豉油,2,L,Kitchen,Seasonings,,important,keep,food
15,Bouillon cubes,湯塊,2,box,Kitchen,Seasonings,,important,keep,food
16,Salt,鹽,2,kg,Garage,Seasonings,,essential,stock_up,food
17,Blackstrap molasses,黑糖蜜,1,jar,Kitchen,Sweeteners,,nice,keep,food
18,Pure maple syrup,純楓糖漿,1,L,Kitchen,Sweeteners,,nice,keep,food
19,White sugar,白糖,4,kg,Garage,Sweeteners,,important,stock_up,food
20,Raw honey,生蜂蜜,1,kg,Kitchen,Sweeteners,,important,stock_up,food
21,Coconut oil,椰子油,2,L,Kitchen,Fats and oils,,important,keep,food
22,Ghee,酥油,1.5,kg,Kitchen,Fats and oils,Not regular butter,important,keep,food
23,Canned meat,肉類罐頭,30,can,Garage,Proteins,,essential,stock_up,food
24,Nonfat powdered milk,脫脂奶粉,4,kg,Kitchen,Proteins,Nonfat keeps longer,important,keep,food
25,Dried lentils,乾扁豆,3,kg,Garage,Proteins,,essential,stock_up,food
26,Dried beans,乾豆,5,kg,Garage,Proteins,,essential,stock_up,food
27,Hardtack bread,硬餅乾（壓縮乾糧）,2,box,Garage,Grains,,essential,keep,food
28,Dried corn or cornmeal,乾粟米（或粟米粉）,1,kg,Garage,Grains,,important,keep,food
29,Rolled oats,燕麥片,8,kg,Garage,Grains,,essential,stock_up,food
30,Dry pasta,乾意大利麵,10,kg,Garage,Grains,,essential,stock_up,food
31,White rice,白米,36,kg,Garage,Grains,Two 18 kg bags,essential,stock_up,food
32,Drinking water,飲用水,280,L,Garage,Water,Two weeks; 600 L for a full month,essential,keep,food
33,Water filter or purification tablets,濾水器／淨水藥片,1,each,Garage,Water,,essential,keep,emergency
34,Canned fish,魚類罐頭,30,can,Garage,Proteins,,essential,stock_up,food
35,Canned vegetables,蔬菜罐頭,40,can,Garage,Fruit and vegetables,,important,stock_up,food
36,Canned tomatoes,番茄罐頭,15,can,Garage,Fruit and vegetables,,important,keep,food
37,Canned fruit,水果罐頭,20,can,Garage,Fruit and vegetables,,important,keep,food
38,Peanut butter,花生醬,4,jar,Kitchen,Proteins,1 kg jars,essential,keep,food
39,Dried fruit,乾果,2,kg,Kitchen,Fruit and vegetables,,important,keep,food
40,Rice noodles / dried noodles,米粉／乾麵,5,kg,Garage,Grains,,important,keep,food
41,Dried shiitake mushrooms,乾冬菇,0.5,kg,Kitchen,Fruit and vegetables,,nice,keep,food
42,Canned dace with black beans,豆豉鯪魚罐頭,10,can,Garage,Proteins,,important,keep,food
43,White flour,白麵粉,5,kg,Garage,Baking,,important,keep,food
44,Instant yeast,即溶酵母,0.5,kg,Freezer,Baking,,nice,no_overstock,food
45,Baking powder,發粉,1,each,Kitchen,Baking,Loses strength after about 1 year,nice,no_overstock,food
46,Vegetable or canola oil,菜油,3,L,Kitchen,Fats and oils,,important,keep,food
47,Electrolyte powder,電解質沖劑,30,pack,Kitchen,Health,,important,keep,food
48,Multivitamins,綜合維他命,2,bottle,Kitchen,Health,About 120 tablets per bottle; 1 tablet per person per day,important,keep,food
49,Manual can opener,手動開罐器,2,each,Kitchen,Supplies,,essential,keep,emergency
50,Camping stove and fuel,露營爐及燃料,1,each,Garage,Supplies,Fuel for 30 days; store fuel away from the house door,essential,keep,emergency
51,Mylar bags and oxygen absorbers,密封袋及脫氧劑,20,pack,Garage,Supplies,,nice,keep,emergency
52,Food-grade buckets with lids,食品級膠桶,8,each,Garage,Supplies,,nice,keep,emergency
53,First aid kit,急救包,1,each,Kitchen,Health,Check every 6 months and replace used or expired items,essential,keep,emergency
54,Prescription medicines,處方藥物,5,pack,Kitchen,Health,One month supply for each person who takes regular medicine; rotate before expiry,essential,no_overstock,emergency
55,Flashlights or headlamps,電筒／頭燈,5,each,Kitchen,Lighting and power,One per person; headlamps keep hands free,essential,keep,emergency
56,Batteries (AA and AAA),電池（AA及AAA）,48,each,Kitchen,Lighting and power,Alkaline or lithium keep for about 10 years,essential,stock_up,emergency
57,Radio (battery or hand-crank),收音機（電池或手搖）,1,each,Kitchen,Lighting and power,For news when phones and internet are down,essential,keep,emergency
58,Toilet paper,廁紙,40,each,Garage,Hygiene,Rolls,essential,stock_up,emergency
59,Bleach (unscented),漂白水（無香味）,2,L,Garage,Hygiene,Loses strength after about 1 year; for disinfecting water and surfaces,essential,no_overstock,emergency
60,Power banks,流動充電器（尿袋）,2,each,Kitchen,Lighting and power,Recharge every 3 months,important,keep,emergency
61,Fire extinguisher (ABC),滅火筒（ABC）,1,each,Kitchen,Safety,Check the pressure gauge once a year,important,keep,emergency
62,N95 masks,N95口罩,1,box,Kitchen,Health,For dust after an earthquake and wildfire smoke,important,keep,emergency
63,Heavy-duty garbage bags,重型垃圾袋,50,each,Garage,Hygiene,For waste and as rain cover,important,stock_up,emergency
64,"Soap, toothpaste and hand sanitizer",肥皂、牙膏及搓手液,1,pack,Kitchen,Hygiene,"One month for 5 people: about 5 bars of soap, 3 tubes of toothpaste, 1 L of hand sanitizer",important,keep,emergency
65,Work gloves,工作手套,5,each,Garage,Tools,Pairs; for cleaning up broken glass,important,keep,emergency
66,Lighters or waterproof matches,打火機／防水火柴,4,each,Kitchen,Tools,For the camping stove,important,keep,emergency
67,Duct tape and plastic sheeting,強力膠紙及膠布,3,each,Garage,Tools,"2 rolls of duct tape, 1 plastic sheet",important,keep,emergency
68,Copies of documents in a waterproof bag,證件副本（防水袋）,1,each,Kitchen,Safety,"ID, insurance, medical information and contact list; update once a year",important,keep,emergency
69,Canned chicken noodle soup,雞湯麵罐頭,20,can,Garage,Soups and ready meals,Condensed soup needs a can of water; ready-to-serve does not,important,stock_up,food
70,Canned clam chowder,周打蜆湯罐頭,10,can,Garage,Soups and ready meals,Ready to serve,important,keep,food
71,Canned beef stew,燉牛肉罐頭,15,can,Garage,Soups and ready meals,A full meal that can be eaten cold if needed,important,stock_up,food
72,Canned chili with beans,辣肉醬豆罐頭,10,can,Garage,Soups and ready meals,Protein and calories in one can,important,keep,food
73,Canned baked beans,茄汁焗豆罐頭,15,can,Garage,Proteins,Ready to eat,important,stock_up,food
74,Canned chickpeas,鷹嘴豆罐頭,10,can,Garage,Proteins,Cooked; no soaking or fuel needed,important,stock_up,food
75,Evaporated milk,淡奶,10,can,Kitchen,Proteins,For tea and cooking; best within about 1 year,nice,no_overstock,food
76,Canned mixed grain congee,八寶粥罐頭,12,can,Garage,Soups and ready meals,Sweet and ready to eat,nice,keep,food
77,Preserved mustard tuber (zha cai),榨菜,6,can,Kitchen,Seasonings,Goes with rice and congee,nice,keep,food`
