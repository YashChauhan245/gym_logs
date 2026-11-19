"""Build LiftLog's food seed from the USDA 2021–23 survey JSON and SR Legacy CSV ZIPs."""

import csv
import io
import json
import sys
from pathlib import Path
from zipfile import ZipFile


# FDC id | local id | display name | search aliases | optional household units
# Household weights are practical defaults for this app and can be overridden in grams.
MAPPING = """
2707713|roti|Roti (chapati)|roti;rotis;chapati;chapatis;phulka|piece:roti:40
2707427|dal|Dal|dhal;daal;lentil dal;dal tadka|katori:katori:150;cup:cup:240
169757|rice|Cooked white rice|rice;white rice;chawal;basmati rice;steamed rice|katori:katori:150;cup:cup:158
2705740|paneer-survey|Paneer (USDA survey)|usda paneer|
2708346|idli|Idli|idlis;steamed idli|piece:idli:45
2708347|dosa|Plain dosa|dosa;dosas|piece:dosa:80
2707430|sambar|Vegetable sambar|sambar;sambhar|katori:katori:150
2707715|paratha|Paratha|parathas;plain paratha|piece:paratha:65
2706538|chicken-biryani|Chicken biryani|biryani chicken;chicken biriyani|katori:katori:175
2708985|veg-biryani|Vegetable biryani|veg biryani;biryani vegetable|katori:katori:175
2706490|meat-biryani|Meat biryani|biryani with meat|katori:katori:175
2709631|palak-paneer|Palak paneer|spinach paneer|katori:katori:150
2709129|stuffed-dosa|Dosa with filling|masala dosa;stuffed dosa|piece:dosa:150
2709128|upma|Upma|rava upma;sooji upma|katori:katori:150
2708730|samosa|Samosa|samosas|piece:samosa:70
2710066|pakora|Pakora|pakoda;pakoras;bhaji|piece:pakora:25
2709309|chutney|Chutney|indian chutney|tbsp:tablespoon:15
2707613|naan|Naan|plain naan;naans|piece:naan:70
2707429|papad|Roasted papad|papad;papadum;poppadom|piece:papad:10
2707431|lentil-curry|Lentil curry|curried lentils|katori:katori:150
2707432|lentil-curry-rice|Lentil curry with rice|dal rice;dal chawal|katori:katori:180
171284|curd|Plain curd (whole milk)|curd;dahi;yogurt;yoghurt|katori:katori:150;cup:cup:245
170886|curd-low-fat|Low-fat plain yogurt|low fat curd;low fat dahi|katori:katori:150
2705385|milk|Whole milk|milk;doodh;full fat milk|glass:glass:244;cup:cup:244
2705393|buttermilk|Buttermilk|chaas;chhach;chhas|glass:glass:240
2705749|farmers-cheese|Farmer’s cottage cheese|farmers cheese;farmer cheese|
169704|brown-rice|Cooked brown rice|brown rice|katori:katori:150;cup:cup:202
168932|short-rice|Cooked short-grain rice|short grain rice|katori:katori:150
169756|white-rice-dry|White rice (dry)|raw rice;uncooked rice|
169705|oats|Oats (dry)|rolled oats;dry oatmeal|
2708380|oatmeal|Cooked oatmeal|oats cooked;porridge|katori:katori:150
168917|quinoa|Cooked quinoa|quinoa|katori:katori:150
168871|millet|Cooked millet|millet;millet cooked|katori:katori:150
169702|millet-dry|Millet (dry)|raw millet|
168893|atta|Whole-wheat atta|atta;whole wheat flour|
168943|jowar|Jowar flour|sorghum flour;jowar|
174288|besan|Besan (chickpea flour)|besan;gram flour;chickpea flour|
168933|sooji|Sooji (semolina)|semolina;rava;suji;sooji|
2707709|wheat-bread|Whole-wheat bread|wheat bread;brown bread|piece:slice:28
2707616|pita|Pita bread|pita|piece:pita:60
173757|chickpeas|Cooked chickpeas|chickpeas;boiled chana;garbanzo;chana;chole|katori:katori:150
2707379|kidney-beans|Cooked kidney beans|kidney beans;rajma beans|katori:katori:150
172421|lentils|Cooked plain lentils|lentils;boiled lentils|katori:katori:150
174284|masoor|Masoor dal (dry red lentils)|raw masoor;red lentils dry;masoor dal|
172437|toor|Cooked pigeon peas|toor dal;arhar dal;pigeon peas|katori:katori:150
174257|moong|Cooked mung beans|moong;moong dal;mung beans|katori:katori:150
169957|moong-sprouts|Mung bean sprouts|moong sprouts;sprouts|katori:katori:100
172427|urad|Cooked urad beans|urad dal;black gram;urad|katori:katori:150
2707359|black-beans|Cooked black beans|black beans|katori:katori:150
2709962|peas|Cooked green peas|green peas;matar;peas|katori:katori:125
172475|tofu|Firm tofu|tofu;soy paneer|
173424|boiled-egg|Boiled egg|egg;eggs;boiled eggs;anda|piece:egg:50
2707152|raw-egg|Whole egg (raw)|raw egg|piece:egg:50
2707171|egg-white|Cooked egg white (with added fat)|egg white;egg whites|
171477|chicken-breast|Cooked chicken breast|chicken breast;grilled chicken breast;chicken|
172388|chicken-thigh|Cooked chicken thigh|chicken thigh|
175168|salmon|Cooked salmon|salmon;salmon fillet|
175180|shrimp|Cooked prawns|prawns;shrimp;grilled prawns|
171986|tuna|Tuna in water (drained)|tuna;canned tuna|
2706293|sardines|Canned sardines|sardines|
2709224|banana|Banana|bananas;kela|piece:banana:118
2709215|apple|Apple|apples;seb|piece:apple:182
2709171|orange|Orange|oranges;santra|piece:orange:131
2709242|mango|Mango|mangoes;aam|katori:katori:150
2709246|papaya|Papaya|papita|katori:katori:140
2709238|guava|Guava|amrood|piece:guava:55
2709260|pineapple|Pineapple|ananas|katori:katori:150
2709270|watermelon|Watermelon|tarbooz|katori:katori:150
2709237|grapes|Grapes|angoor|katori:katori:150
2709283|strawberry|Strawberries|strawberry|katori:katori:140
2709267|pomegranate|Pomegranate arils|pomegranate;anar|katori:katori:150
2709239|kiwi|Kiwi|kiwi fruit|piece:kiwi:70
168191|dates|Medjool dates|dates;khajoor|piece:date:24
173021|fig|Fresh figs|fig;anjeer|piece:fig:50
2709524|potato|Baked potato|potato;aloo|piece:potato:170
2709697|sweet-potato|Cooked sweet potato|sweet potato;shakarkandi|
2709614|spinach-raw|Spinach (raw)|raw spinach;palak|
168463|spinach|Cooked spinach|spinach;boiled palak|katori:katori:150
2709777|cauliflower|Cauliflower (raw)|cauliflower;gobi|
2709785|eggplant|Eggplant (raw)|eggplant;brinjal;baingan|
170457|tomato|Tomato (raw)|tomato;tomatoes;tamatar|piece:tomato:120
2709784|cucumber|Cucumber (raw)|cucumber;kheera|
2709660|carrot|Carrot (raw)|carrot;carrots;gajar|piece:carrot:61
2709795|onion|Onion (raw)|onion;onions;pyaz|piece:onion:110
169975|cabbage|Cabbage (raw)|cabbage;patta gobi|
2709946|okra|Cooked okra|okra;bhindi;ladyfinger|katori:katori:120
2709770|beetroot|Beetroot (raw)|beetroot;beets;chukandar|
170108|capsicum|Red capsicum (raw)|capsicum;red bell pepper;bell pepper|
2709643|broccoli|Broccoli (raw)|broccoli|
2709223|avocado|Avocado|avocados|
2709793|mushrooms|Mushrooms (raw)|mushrooms;mushroom|
169231|ginger|Ginger (raw)|ginger;adrak|tsp:teaspoon:2
169230|garlic|Garlic (raw)|garlic;lahsun|piece:clove:3
170497|green-chilli|Green chilli (raw)|green chili;green chilli;hari mirch|piece:chilli:10
167747|lemon-juice|Lemon juice|lemon;nimbu juice|tbsp:tablespoon:15
2707485|almonds|Almonds|badam;almond|serving:handful:28
2707493|cashews|Cashews|kaju;cashew|serving:handful:28
2707512|peanuts|Peanuts|moongfali;groundnuts;peanut|serving:handful:28
2707531|walnuts|Walnuts|akhrot;walnut|serving:handful:28
2707527|pistachios|Pistachios|pista;pistachio|serving:handful:28
2707586|sesame|Sesame seeds|til;sesame|tbsp:tablespoon:9
2707588|flax|Flax seeds|alsi;flaxseed|tbsp:tablespoon:10
2707590|chia|Chia seeds|chia|tbsp:tablespoon:12
2707579|pumpkin-seeds|Pumpkin seeds|pepitas|tbsp:tablespoon:10
2707537|peanut-butter|Peanut butter|groundnut butter|tbsp:tablespoon:16
2710168|ghee|Ghee|clarified butter;desi ghee|tsp:teaspoon:5;tbsp:tablespoon:14
2710188|oil|Canola oil|cooking oil;oil;vegetable oil|tsp:teaspoon:4.5;tbsp:tablespoon:13.6
2710186|olive-oil|Olive oil|extra virgin olive oil|tsp:teaspoon:4.5;tbsp:tablespoon:13.5
2710182|coconut-oil|Coconut oil|nariyal oil|tsp:teaspoon:4.5;tbsp:tablespoon:13.6
2710155|butter|Butter|makhan|tsp:teaspoon:4.7;tbsp:tablespoon:14
2710281|honey|Honey|shahad|tsp:teaspoon:7;tbsp:tablespoon:21
2710258|sugar|Granulated sugar|sugar;chini|tsp:teaspoon:4;tbsp:tablespoon:12.5
2709212|raisins|Raisins|kishmish;raisin|tbsp:tablespoon:9
173647|water|Water|drinking water|glass:glass:250
"""

# Name, aliases, cooked yield, default serving, tracked ingredients in grams.
RECIPES = {
    'chai': ('Milk chai with sugar', ['chai', 'milk tea', 'chai with sugar'], 200, ('glass', 'glass', 200), {'milk': 80, 'sugar': 8, 'water': 112}),
    'lassi': ('Sweet lassi', ['lassi', 'sweetened lassi'], 250, ('glass', 'glass', 250), {'curd': 150, 'sugar': 16, 'water': 84}),
    'chana-masala': ('Chana masala', ['chole masala', 'chickpea curry'], 385, ('katori', 'katori', 150), {'chickpeas': 220, 'onion': 55, 'tomato': 85, 'oil': 9, 'ginger': 4, 'garlic': 6, 'water': 35}),
    'rajma': ('Rajma curry', ['rajma', 'rajma masala', 'kidney bean curry'], 420, ('katori', 'katori', 150), {'kidney-beans': 230, 'onion': 60, 'tomato': 100, 'oil': 10, 'ginger': 5, 'garlic': 6, 'water': 45}),
    'sabzi': ('Mixed vegetable sabzi', ['sabzi', 'mixed sabzi', 'vegetable curry'], 410, ('katori', 'katori', 150), {'cauliflower': 160, 'carrot': 90, 'peas': 85, 'onion': 45, 'tomato': 50, 'oil': 10, 'garlic': 5}),
    'khichdi': ('Moong dal khichdi', ['khichdi', 'khichadi', 'khichri'], 470, ('katori', 'katori', 180), {'rice': 240, 'moong': 180, 'ghee': 10, 'water': 50}),
    'paneer-bhurji': ('Paneer bhurji', ['paneer scramble'], 340, ('katori', 'katori', 150), {'paneer': 170, 'onion': 65, 'tomato': 100, 'capsicum': 50, 'oil': 9, 'ginger': 4}),
}

IDS = {'kcal': 1008, 'protein': 1003, 'carbs': 1005, 'fat': 1004}


def read_csv(archive, name):
    path = next(path for path in archive.namelist() if Path(path).name == name)
    with io.TextIOWrapper(archive.open(path), encoding='utf-8-sig') as content:
        return list(csv.DictReader(content))


def main():
    survey_path, sr_path = sys.argv[1:]
    with ZipFile(survey_path) as archive:
        survey = next(iter(json.loads(archive.read('surveyDownload.json')).values()))
    references = {}
    for row in survey:
        values = {value['nutrient']['id']: value.get('amount') for value in row['foodNutrients']}
        references[row['fdcId']] = (row['description'], values)
    with ZipFile(sr_path) as archive:
        for row in read_csv(archive, 'food.csv'):
            references[int(row['fdc_id'])] = (row['description'], {})
        for row in read_csv(archive, 'food_nutrient.csv'):
            key = int(row['nutrient_id'])
            if key in IDS.values() and row['amount']:
                references[int(row['fdc_id'])][1][key] = float(row['amount'])

    foods = {}
    for line in MAPPING.strip().splitlines():
        fdc_id, key, name, aliases, portions = line.split('|')
        title, values = references[int(fdc_id)]
        foods[key] = {
            'id': f'food:{key}', 'name': name, 'aliases': aliases.split(';') if aliases else [],
            'per100g': {field: values[value] for field, value in IDS.items()},
            'portions': [portion(unit, label, float(grams)) for unit, label, grams in (item.split(':') for item in portions.split(';') if item)],
            'source': {'kind': 'USDA', 'reference': title, 'url': f'https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients'},
        }
        if key == 'paneer-survey':
            foods['paneer'] = {
                'id': 'food:paneer', 'name': 'Malai paneer (Amul reference)',
                'aliases': ['paneer', 'paneer cubes', 'indian cottage cheese', 'malai paneer', 'amul paneer'],
                'per100g': {'kcal': 323, 'protein': 20, 'carbs': 4.5, 'fat': 25}, 'portions': [],
                'source': {'kind': 'Label estimate', 'reference': 'Amul Malai Paneer label per 100 g. Other paneer recipes vary.', 'url': 'https://old.amul.com/products/amul-malaipaneer-info.php'},
            }
    for key, (name, aliases, yield_grams, serving, ingredients) in RECIPES.items():
        foods[key] = {
            'id': f'food:{key}', 'name': name, 'aliases': aliases,
            'per100g': {field: round(sum(foods[ingredient]['per100g'][field] * grams for ingredient, grams in ingredients.items()) / yield_grams, 4) for field in IDS},
            'portions': [portion(*serving)],
            'source': {'kind': 'Recipe estimate', 'reference': 'LiftLog example recipe using the listed ingredient references'},
            'recipe': {'yieldGrams': yield_grams, 'servings': yield_grams / serving[2], 'ingredients': [{'foodId': f'food:{ingredient}', 'grams': grams} for ingredient, grams in ingredients.items()]},
        }
    Path('public/data/foods.json').write_text(json.dumps(list(foods.values()), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Imported {len(foods)} foods with documented nutrient references.')


def portion(unit, label, grams):
    return {'unit': unit, 'label': label, 'grams': grams}


if __name__ == '__main__':
    main()
