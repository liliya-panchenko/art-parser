const curl = require('curl');
const jsdom = require('jsdom');
const fs = require('fs');
const axios = require('axios');
const cyrillicToTranslit = require('cyrillic-to-translit-js');

const {transform} = cyrillicToTranslit();

const {JSDOM} = jsdom;
const domain = 'https://collection.artsacademymuseum.org';
const catalogueUrl = domain + '/api/search-entities/OBJECT';
const pageUrl = domain + '/entity/OBJECT/';
const file = 'out.csv';
const log = 'log.txt';
const imagesDirectory = './images/';

const separator = ';';

let start = process.argv[0];

fs.readFile(file, function(err, data) {
    if (data.length === 0) {
        createHeaders();
    }

    fetchCatalogue();
})

function fetchCatalogue() {
    curl.postJSON(catalogueUrl, {
        count: 20,
        filters: {
            fund: ['14']
        },
        query: null,
        sort: '90',
        start: start,
    }, null, (err, res, data) => {
        if (res.statusCode === 200) {
            let json = JSON.parse(data);
            let ids = json.data.map(item => item.id);
            ids.forEach(id => { fetchPage(id); });
        } else {
            console.log('Error while fetching catalogue url');
        }
    });
}

function fetchPage(id) {
    curl.get(pageUrl + id, null, (err, res, body) => {
        if (res.statusCode === 200) {
            parsePage(body, id);
        } else {
            console.log('Error while fetching page url: ' + id);
            updateLog(id);
        }
    });
}

function parsePage(html, id) {
    let dom = new JSDOM(html);

    let jsonString = dom.window.document.getElementById('my-app-state').textContent;
    let json = jsonString.replace(/\&q;/g, '"');
    let data = JSON.parse(json);

    createRecord(data['/api/entity/OBJECT/' + id], id).then(res => {
        console.log('Record created.');
    });
}

async function createRecord(data, id) {
    if (!data || !data.image || !data.data) {
        console.log('Error while data parsing: ' + id);
        updateLog(id);
    }

    let result = {};
    let info = data.data;

    if (Array.isArray(info)) {
        info.forEach(item => {
            if (item.attribute === 'author' && item.data.length) {
                result.author = (item.data[0].title || '').replace(/\"/g, '\\"');
            }

            if (item.attribute === 'object_title' && item.value.length) {
                result.title = (item.value[0] || '').replace(/\"/g, '\\"');
            }

            if (item.attribute === 'material_techniq' && item.value.length) {
                [result.material = '', result.technique = ''] = (item.value[0] || '').split(separator);
            }

            if (item.attribute === 'dimensions' && item.value.length) {
                result.dimensions = item.value[0] || '';
            }

            if (item.attribute === 'typeiss' && item.data.length) {
                result.type = item.data[0].title || '';
            }
        });
    }

    let dir = findDirectory(transform(result.author || 'unsorted'));
    let filenameArr = data.image.split('/');
    let filename = dir + '/' + filenameArr[filenameArr.length-1];

    await downloadImage(domain + data.image + '?w=3000&h=3000', filename).then(res => {
        let record = [
            result.author,
            result.title,
            result.material,
            result.technique,
            result.dimensions,
            result.type,
            dir,
            filenameArr[filenameArr.length-1]
    ].join(separator) + '\n';

        fs.appendFile(file, record, function (err) {
            if (err) throw err;
            console.log(record);
        });

    }, (err) => {
        updateLog(id);
    })
}

function findDirectory(name) {
    let dir = imagesDirectory + name;

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    return dir;
}

async function downloadImage(url, image_path) {
    return axios({url, responseType: 'stream'})
        .then((response) => new Promise((resolve, reject) => {
            response.data
                .pipe(fs.createWriteStream(image_path))
                .on('finish', resolve)
                .on('error', reject);
        }));
}

function createHeaders() {
    let headers = [
        'Author', 'Title', 'Material', 'Technique', 'Dimensions', 'Type', 'Folder', 'Image'
    ].join(separator) + '\n';

    fs.appendFile('out.csv', headers, function (err) {
        if (err) throw err;
        console.log('Headers created:');
        console.log(headers);
    });
}

function updateLog(id) {
    fs.appendFile(log, id + '\n', function (err) {
        if (err) throw err;
        console.log('Log updated');
    });
}
