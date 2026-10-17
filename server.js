const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_GROUP = '12';

let cacheData = {
    group: TARGET_GROUP,
    statusText: 'Завантаження даних з Чернівціобленерго...',
    schedules: [],
    lastUpdated: null,
    updateNotice: ''
};

async function parseOblenergoData() {
    try {
        console.log(`[${new Date().toLocaleTimeString('uk-UA')}] Оновлення даних з oblenergo.cv.ua...`);

        const response = await axios.get('https://oblenergo.cv.ua/shutdowns/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);

        let notice = $('*:contains("актуальний станом на"), *:contains("Оновлено")').last().text().replace(/refresh/gi, '').replace(/\s+/g, ' ').trim();
        if (!notice) {
            notice = 'Інформацію отримано з сайту Обленерго';
        }

        let intervals = [];

        $('tr, div.group-item, div.row').each((_, element) => {
            const text = $(element).text();
            if (text.includes(`Група ${TARGET_GROUP}`) || text.includes(`${TARGET_GROUP} група`) || text.includes(`Гр. ${TARGET_GROUP}`)) {
                $(element).find('td, div, span').each((_, cell) => {
                    const cellText = $(cell).text().trim();
                    if (/\d{1,2}:\d{2}/.test(cellText) && !intervals.includes(cellText)) {
                        intervals.push(cellText);
                    }
                });
            }
        });

        if (intervals.length === 0) {
            $('tr:contains("12")').each((_, tr) => {
                const rowText = $(tr).text().replace(/\s+/g, ' ').trim();
                if (rowText && rowText.length < 200) {
                    intervals.push(rowText);
                }
            });
        }

        cacheData = {
            group: TARGET_GROUP,
            statusText: 'Дані успішно оновлено',
            schedules: intervals.length > 0 ? intervals : ['Наразі відключень не заплановано або графік відсутній'],
            lastUpdated: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
            updateNotice: notice
        };

        console.log(`[Успіх] Дані для ${TARGET_GROUP}-ї групи оновлено.`);
    } catch (error) {
        console.error('[Помилка парсингу]:', error.message);
        cacheData.statusText = 'Тимчасова помилка зв’язку з сайтом Обленерго';
    }
}

parseOblenergoData();

cron.schedule('*/5 * * * *', () => {
    parseOblenergoData();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
    res.json(cacheData);
});

app.get('/api/refresh', async (req, res) => {
    await parseOblenergoData();
    res.json(cacheData);
});

app.listen(PORT, () => {
    console.log(`Сервер запущено! Відкрийте у браузері: http://localhost:${PORT}`);
});
