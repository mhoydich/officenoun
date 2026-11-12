// Office Noun: one Noun per office day. Classic script; runs in the browser and in Node.
// Days 1-10 are canon (hand-made SVG files). Later days are generated from OFFICE_TRAITS.
(function () {
  var SIZE = 32;
  var CELL = 10;
  var BACKGROUND = "#d5d7e1";
  // [file name, head label, other label]; descriptions read "a <head> and <other>".
  var CANON = [
    ["calendar", "calendar head", "office ID"],
    ["calculator", "calculator head", "black tie"],
    ["stapler", "stapler head", "black tie"],
    ["coffee", "coffee bean head", "red tie"],
    ["phone", "cordless phone head", "black shirt"],
    ["mailbox", "mailbox head", "purple tie"],
    ["mouse", "computer mouse head", "black tie"],
    ["mug", "coffee mug head", "pencil pocket"],
    ["pencil", "pencil head", "office ID"],
    ["laptop", "laptop head", "pencil pocket"]
  ];

  function dayNumber(startDate, timeZone, now) {
    var start = startDate.split("-").map(Number);
    var parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: timeZone, year: "numeric" }).formatToParts(now || new Date());
    var part = function (type) {
      return Number(parts.filter(function (item) { return item.type === type; })[0].value);
    };
    var today = Date.UTC(part("year"), part("month") - 1, part("day"));
    return Math.max(1, Math.floor((today - Date.UTC(start[0], start[1] - 1, start[2])) / 86400000) + 1);
  }

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) >>> 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Standard Nouns RLE: palette byte, bounds (top, right, bottom, left), then (length, colorIndex) pairs.
  function paint(grid, trait, palette) {
    var bytes = trait.data.slice(2).match(/../g).map(function (hex) { return parseInt(hex, 16); });
    var top = bytes[1], right = bytes[2], left = bytes[4];
    var x = left, y = top;
    for (var i = 5; i < bytes.length; i += 2) {
      for (var n = 0; n < bytes[i]; n += 1) {
        if (bytes[i + 1] && palette[bytes[i + 1]]) grid[y][x] = palette[bytes[i + 1]];
        x += 1;
        if (x >= right) { x = left; y += 1; }
      }
    }
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function forDay(day) {
    day = Math.max(1, Math.floor(day));
    var headIndex = (day - 1) % CANON.length;
    var canon = CANON[headIndex];
    var noun = { day: day, canon: day <= CANON.length, name: canon[0], svgPath: null, parts: null, grid: null };

    if (noun.canon) {
      noun.svgPath = "nouns/" + canon[0] + ".svg";
      noun.description = "a " + canon[1] + " and " + canon[2];
      noun.traitLine = capitalize(canon[1]) + ". " + capitalize(canon[2]) + ".";
      return noun;
    }

    var traits = globalThis.OFFICE_TRAITS;
    var random = mulberry32((day * 2654435761) >>> 0);
    var pick = function (pool) { return pool[Math.floor(random() * pool.length)]; };
    var body = pick(traits.bodies);
    var accessory = pick(traits.accessories);
    var glasses = pick(traits.glasses);
    var head = traits.heads[headIndex];
    noun.parts = { body: body, accessory: accessory, head: head, glasses: glasses };

    noun.grid = [];
    for (var row = 0; row < SIZE; row += 1) noun.grid.push(new Array(SIZE).fill(null));
    [body, accessory, head, glasses].forEach(function (trait) { paint(noun.grid, trait, traits.palette); });

    noun.description = "a " + head.label + ", " + glasses.label + " and " + (accessory.filename === "accessory-none" ? "no accessory" : "a " + accessory.label);
    noun.traitLine = [head.label, glasses.label, accessory.label].map(function (label) { return capitalize(label) + "."; }).join(" ");
    return noun;
  }

  function svg(noun) {
    if (!noun.grid) return null;
    var size = SIZE * CELL;
    var out = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="' + BACKGROUND + '" />';
    noun.grid.forEach(function (row, y) {
      for (var x = 0; x < SIZE; ) {
        var color = row[x];
        var end = x + 1;
        while (color && end < SIZE && row[end] === color) end += 1;
        if (color) out += '<rect width="' + (end - x) * CELL + '" height="' + CELL + '" x="' + x * CELL + '" y="' + y * CELL + '" fill="' + color + '" />';
        x = end;
      }
    });
    return out + "</svg>";
  }

  function src(noun, assetPrefix) {
    return noun.canon ? assetPrefix + "/" + noun.svgPath : "data:image/svg+xml," + encodeURIComponent(svg(noun));
  }

  globalThis.OfficeNoun = { dayNumber: dayNumber, forDay: forDay, svg: svg, src: src, size: SIZE, background: BACKGROUND };
})();
