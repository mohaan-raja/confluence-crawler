const axios = require( "axios" )
const fetch = require('node-fetch')
const fs = require('fs')
const fse = require('fs-extra')
const pandoc = require('node-pandoc')
const { program } = require('commander');
const { exit } = require("process")

const spaceKey = "freshsales";
const baseUrl = "https://confluence.freshworks.com";
const spaceEndpoint = "rest/api/space";
const pageUrl = `rest/api/content`;
const spaceUrl = `${pageUrl}?spaceKey=${spaceKey}`;
const htmlOutputDir = "htmlOuput";
const errorOutputDir = "errors";
const docsOutputDir = "docs";
const CONF_ACCESS_TOKEN = "NjM1Njg5MTY0NjA3OsUCrcB/46nsuUEGPYbvhxknbyTN";
const imageRegex = /<img[^>]+src="([^">]+)"/ig;
const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONF_ACCESS_TOKEN}`
};

program
  .option('-s, --spaceKey <type>', 'Confluence space-key to extract all the pages under the space')
  .option('-p, --pageId <type>', 'Confluence page id to extract all the contents under the page')

program.parse(process.argv);

const options = program.opts();

let confluenceDocsMap = [];

console.log('Creating output directories....')
try {
  !fs.existsSync(docsOutputDir) && fs.mkdirSync(docsOutputDir);
  !fs.existsSync(htmlOutputDir) && fs.mkdirSync(htmlOutputDir);
  !fs.existsSync(errorOutputDir) && fs.mkdirSync(errorOutputDir);
}
catch (error) {
  console.log("Directory creation failed... Exiting!")
  exit(1);
}
console.log('Directories created successfully.')

// Function to extract the pages based on the given spaceKey
const GetAllConfluenceDocsForGivenSpaceKey = (baseUrl, next) => {
    console.log(`${baseUrl}${next}`)
    axios.get(`${baseUrl}${next}`, {headers: headers})
        .then((response) => {
            const confMeta = response.data;
            const pages = response.data.results;
            
            pages.forEach( (page) => {
                console.log(page._links.self)
                RetrievePageWithAttachments(page.id)
                confluenceDocsMap.push({title: page.title, url: page._links.self, pageId: page.id })
            })
            
            // if (confMeta._links.next) {
            //     GetAllConfluenceDocsForGivenSpaceKey(`${baseUrl}`, `${confMeta._links.next}`)
            // }
            console.log(`All docs in space ${spaceKey} file creation successful`);
    })
    .catch((err) => {console.log(err)})
}

// Check whether the URL provided is appropriate / absolute URL
// Essentially used for the image src attrivbute to check whether the URLs are absolute or not
const isValidURL = (str) => {
  const urlRegex = '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$';
  const url = new RegExp(urlRegex, 'i');
  return str.length < 2083 && url.test(str);
}

// Core logic to convert the image to its base64 format
async function imageUrlToBase64(url, headers) {
  try {

    const isValid = isValidURL(url)
    if (!isValid) {
      console.log(`Invalid URL received ${url}, modifying the URL with ${baseUrl} domain...`)
      url = `${baseUrl}${url}`
    } 

    // Using fetch library here instead of axios to avoid addition manipulation
    // or conversion of JSON type to arrayBuffer.
    const response = (isValidURL(url)) ? await fetch(url, {headers}) : null;

    // Simply ignore processing the images when the URL is not absolute URL
    // It will not yield any results with relative URLs
    if (response == null) {
      console.log(`Still invalid response received for ${url}... Exiting without base64 conversion.`)
      return;
    }

    const blob = await response.arrayBuffer();

    const contentType = response.headers.get('content-type');

    const base64String = `data:${contentType};base64,${Buffer.from(
      blob,
    ).toString('base64')}`;

    return base64String;
  } catch (err) {
    console.log(`Received error during base64 conversion for ${url} with error ${err}`);
  }
}

// Reconstruct the image src attribute with inline image as data value
// This helps avoiding the authetication errors during image fetch requests
// as the images are behind freshworks confluence
const imageReplacer = async (match, ...args) => {
    try {
    const imgSrcRegex = 'src\s*=\s*"([^"]+)"'
    const imgMatches = match.match(imgSrcRegex)
    const imgSrcUrl = imgMatches[1]
    // console.log(imgSrcUrl)
    const base64 = await imageUrlToBase64(imgSrcUrl, headers)
    const dataUrl = `${base64}` //`data:image/png;base64,${base64}`;
    const parsedContents = match.replace(imageRegex, (m) => m.replace(imgSrcUrl, dataUrl));
    return parsedContents
    } catch (err) {
      console.log(`Received error during imageReplace for ${match} with error ${err}`);
    }
}

// Container function to fire all the image reconstructions
// Uses promises to collect all the responses and create the 
// html file with images inline (i.e. at appropriate position as in confluence page)
async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (full, ...args) => {
      promises.push(asyncFn(full, ...args));
      return full;
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

// Modular function to fetch the confluence page with the given pageId
const RetrievePageWithAttachments = async (pageId) => {
  const url = `https://confluence.freshworks.com/rest/api/content/${pageId}?expand=body.export_view`;
  console.log(`Sourcing the url: ${url}`)

  axios.get(`${url}`, {headers: headers} )
    .then((response) => {
      const res = response.data
      const htmlContent = `<h1>Title: ${res.title}</h1>` + res.body.export_view.value
      let fileName = res.title.replace(/[^a-zA-Z0-9]/g,'_');
          fileName = fileName.split('', 50).join('');

      replaceAsync(htmlContent, imageRegex, imageReplacer)
        .then(replacedString => {
          
          fse.outputFile(`${htmlOutputDir}/${fileName}.html`, replacedString, {flag: 'a+'}, err => {
            if (err) {
              console.log('HTML file creation failed', err);
              return;
            } else {
              console.log(`HTML file created successfully:: ${htmlOutputDir}/${fileName}.html`);
            }
          });

          (async () => {
              let args = '-f html -t docx -o ';
              args = args + `${docsOutputDir}/${fileName}.docx`
              
              console.log(`Invoking the DOCX converstion process from HTML content...`)
              pandoc(replacedString, args, (error, result) => {
                if (error) {
                  // console.log('Oh Nos: ', error.message);
                  fse.outputFile(`${errorOutputDir}/${fileName}.txt`, error.message, {flag: 'a+'}, err => {
                    if (err) {
                      console.log('Docx errors file creation failed', err);
                      return;
                    } else {
                      console.log(`Docx errors file created successfully:: ${errorOutputDir}/${fileName}.html`);
                    }
                  });
                }
                else {
                  console.log("Docx file creation status: ", result ? "Successful" : "Failed");
                }

                return result
              })

            })();
        }).catch((error) => {
          console.log(`Error occurred during ReplaceAsync invocation: ${error}`)
          fse.outputFile(`${errorOutputDir}/${fileName}.txt`, error, {flag: 'a+'}, err => {
            if (err) {
              console.log('ReplaceAsync errors file creation failed', err);
              return;
            } else {
              console.log(`ReplaceAsync errors file created successfully:: ${errorOutputDir}/${fileName}.txt`);
            }
          });
        }).catch((error) => {
          console.log(`Error occurred during Axios invocation during extraction of URL ${url}:: ${error}`)
          fse.outputFile(`${errorOutputDir}/${fileName}.txt`, error, {flag: 'a+'}, err => {
            if (err) {
              console.log('Confluence extraction errors file creation failed', err);
              return;
            } else {
              console.log(`Confluence extraction errors file created successfully:: ${errorOutputDir}/${fileName}.txt`);
            }
          });
        })
    })
}

const isValidEntity = (entityUrl, callback) => {
  axios.get(`${entityUrl}`, {headers: headers})
    .then((res) => {
      console.log(res.status)
      callback(null, true)
    })
    .catch((err) => {
      callback(err.response.status == 404 ? "false" : "true")
    })
  
}

console.log(options)

if (options.spaceKey && options.pageId) {
  console.log("You have provided both SpaceKey and PageId... Program will resume with PageID")
  options.spaceKey = false
}

if (options.spaceKey) {
  const spaceId = options.spaceKey
  console.log(`Command is to crawl the confluence space ${spaceId}... \nValidating the existence of space...`)
  isValidEntity(`${baseUrl}/${spaceEndpoint}/${spaceId}`, (err, res) => {
    if (res) {
      console.log("valid")
      GetAllConfluenceDocsForGivenSpaceKey(baseUrl, `/${spaceUrl}&start=0&limit=500`)
     }
     else {
        console.log(`${sapceKey} doesn't exists. Exiting...`)
        exit(1);
     }
  })
}

if (options.pageId) {
  const pageId = options.pageId
  console.log(`Command is to crawl the confluence page ${pageId}... \nValidating the existence of page...`)
   isValidEntity(`${baseUrl}/${pageUrl}/${pageId}`, (err, res) => {
    if (res) {
      console.log("valid")
      RetrievePageWithAttachments(pageId)
     }
     else {
        console.log(`${pageId} doesn't exists!. Exiting...`)
        exit(1);
     }
  })
}

// const pages = [1426597] // [987114, 987217, 1205586, 1414594, 1426597]

// pages.forEach((page) => {
//   console.log(`Sourcing the page ${page}`)
//   RetrievePageWithAttachments(page)
  
// })

// const fileContents = JSON.parse(fs.readFileSync(confluencePagesFilename, 'utf8'));

// fileContents.forEach((file) => {
//   RetrievePageWithAttachments(file.pageId)
// })

//RetrievePageWithAttachments(1426597)

// imageUrlToBase64("/a/a/a/", headers)