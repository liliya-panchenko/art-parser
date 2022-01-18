const fs = require('fs');
const papa = require('papaparse');
const axios = require('axios');
const cyrillicToTranslit = require('cyrillic-to-translit-js');

const {transform} = cyrillicToTranslit();

const catalogueUrl = `/api/search-entities/OBJECT`;
const pageUrl = `/api/entity/OBJECT`;
const file = 'out.csv';
const fileJson = 'out.json';
const log = 'log.txt';
const imagesDirectory = './images/';

let param = process.argv[2];

const ArtsAcademyClient = axios.create({
    baseURL: 'https://collection.artsacademymuseum.org',
});

let content = fs.readFileSync(file, 'utf8');
let json = [];

papa.parse(content, {
    header: true,
    delimiter: ';',
    complete: function(results) {
        json = results.data;
    }
})

if (param === 'from-log') {
    fetchFromLog().then(r => {});
} else if (param === 'to-json') {
    fs.writeFileSync(fileJson, JSON.stringify(json));
} else {
    fetchCatalogue().then(status => {
        console.log('Catalogue response status: ' + status);
    });
}

async function fetchFromLog() {
    let logContent = fs.readFileSync(log, 'utf8');
    let ids = logContent.split(/\r?\n/);

    for (let i = 0; i < ids.length; i++) {
        if (ids[i].length) {
            fetchPage(ids[i]).then(message => {
                console.log(message);
            });
            await timeout(1000);
        }
    }
}

async function fetchCatalogue() {
    let response = await ArtsAcademyClient.post(catalogueUrl, {
        count: 500,
        filters: {
            fund: ['14']
        },
        query: null,
        sort: '90',
        start: 3000,
    });

    if (response.status === 200) {
        let listIds = response.data.data.map(item => item.id);

        for (let i = 0; i < listIds.length; i++) {
            fetchPage(listIds[i]).then(message => {
                console.log(message);
            });
            await timeout(1000);
        }
    }

    return response.status;
}

async function timeout(timeoutValue) {
    return new Promise((resolve) => setTimeout(resolve, timeoutValue));
}

async function fetchPage(id) {
    let response = await ArtsAcademyClient.get(`${pageUrl}/${id}`);

    if (response.status === 200) {
        await createRecord(response.data, id);

        fs.writeFileSync(file, papa.unparse(json, {
            header: true,
            delimiter: ';',
        }));

        return 'Record created: ' + id;
    }

    return 'Error while fetching page: ' + id;
}

async function createRecord(data, id) {
    if (!data || data.image === null || !data.data.length) {
        console.log('Error while data parsing: ' + id);
        updateLog(id);
        return;
    }

    let result = getInfo(data.data);
    let authorDir = transform(result.author || 'unsorted');
    let dir = findDirectory(authorDir);
    let originalPathArr = data.image.split('/');
    let originalFilenameArr = originalPathArr[originalPathArr.length-1].split('.');
    let filename = [id, originalFilenameArr[1]].join('.');

    try {
        await downloadImage(data.image + '?w=3000&h=3000', dir + '/' + filename);

        json.push({
            Author: result.author,
            Title: result.title,
            Material: result.material,
            Technique: result.technique,
            Dimensions: result.dimensions,
            Type: result.type,
            Folder: authorDir,
            Image: filename
        })

    } catch(err) {
        console.log('Error while downloading image: ' + filename)
        updateLog(id);
    }
}

function findDirectory(name) {
    let dir = imagesDirectory + name;

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    return dir;
}

async function downloadImage(url, image_path) {
    return ArtsAcademyClient.get(url, {responseType: 'stream'})
        .then((response) => new Promise((resolve, reject) => {
            response.data
                .pipe(fs.createWriteStream(image_path))
                .on('finish', resolve)
                .on('error', reject);
        }));
}

function updateLog(id) {
    fs.appendFileSync(log, id + '\n');
}

function getInfo(info) {
    let result = {};

    if (Array.isArray(info)) {
        info.forEach(item => {
            if (item.attribute === 'author' && item.data.length) {
                result.author = item.data[0].title || '';
            }

            if (item.attribute === 'object_title' && item.value.length) {
                result.title = item.value[0] || '';
            }

            if (item.attribute === 'material_techniq' && item.value.length) {
                [result.material = '', result.technique = ''] = (item.value[0] || '').split(';');
            }

            if (item.attribute === 'dimensions' && item.value.length) {
                result.dimensions = item.value[0] || '';
            }

            if (item.attribute === 'typeiss' && item.data.length) {
                result.type = item.data[0].title || '';
            }
        });
    }

    return result;
}
