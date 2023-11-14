import { createReadStream } from 'fs';
import csv from 'csv-parser';

const results = [];
let previousTime = null;
let counter = 0;

createReadStream('BINANCE_BTCUSD, 240.csv')
    .pipe(csv())
    .on('data', (data) => {
        if (counter === 0 || (data.time - previousTime >= 604800)) {
            results.push({
                time: data.time,
                close: data.close,
                upper_band: data['Upper Band'],
                lower_band: data['Lower Band'],
            });
            previousTime = data.time;
            counter += 1;
        }
    })
    .on('end', () => {
        console.log(results);
    });
