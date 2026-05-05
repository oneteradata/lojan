const data = {
  "wallet": {
    "token_1": "Yx1vfSG4Z3fFralznDJaZTWMm7PuAqsvbdnYeSiDLcGv0KIa0caozKX5KWtPnMmoKOiORNzrE3EQbezuPzqOLcRrGzgeFfgZmgT5nJs59RgrRHiTX2KNmvwfmDZ7vpmBiwJR3y3H11xKJyVyAJlWDstsMETrBsb6vzusnOEYJgjl1fhi9KgJHQDlQ2groQcF08zqdTjDzGc6JWHvQAI8VynOfMqluADOHFv5dYfrmmj0SrWXempSLORqGdubMGZQ",
    "token_2": "ta7phaAjRAqmFJY13jFkmiZCsLzpSWVzLZmafkRBkokr8ecuyLCz3QuiggWjfoZSKcVlqbHbg0ZKsNr7fdSLHHGwE79hn7iDgywwKnlQvNmRNvyyKJd6f1J3R4HChkYeDHSTuHhBbp0kco2H5uNh15z8nGAbtbxv8cza5jOfA2gUw5pCP9iRkgn6qoLcKs8Sugc2tIm0mXp5cd8efEuxWkipLZfMtGosyrK3GpJAURGeEdgcaPwRRWdAGw58MRNH",
    "token_3": "pXs40BRd0ArNKW4CaSlZI8TE7TJqd6uzicUdiDAIh303HTso7NGbBvW42T8mzuCcxUbS1tvLfmNui6h3XatOtQLSXVHVQMvIvfzsx8rjv8cEHcPrp1EUuhYehgtHkBkqVSyQ7blNxqBndpkxNhhmxBpipjzOMbpE9KXVCRAUY8VH4Bcn2zn3K6kU3OIN4oqA6F4BDsghedxfboYwLeyntWsriGFtoTDUKGLrIb6Bx7pZS17Oeq5Tarok0FN28yIA",
  }
};

let rawWallet = data.wallet || {};
let userTokens = [];

if (typeof rawWallet === 'object') {
     if (Array.isArray(rawWallet.tokens)) {
       userTokens = rawWallet.tokens.filter((t) => typeof t === 'string');
     } else {
       // Search for object values
       for (const k in rawWallet) {
         if (typeof rawWallet[k] === 'object' && !Array.isArray(rawWallet[k])) {
           userTokens = userTokens.concat(Object.values(rawWallet[k]).filter((t) => typeof t === 'string'));
         } else if (typeof rawWallet[k] === 'string' && k.startsWith('token_')) {
           userTokens.push(rawWallet[k]);
         }
       }
     }
}

console.log("Extracted:", userTokens.length);
