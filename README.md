## About The Project

[![Confluence Space / Page Extractor]]

You can use this tool to convert the confluence page into html and word document formats.

When you provide a pageID, HTML format is created first and the same is stored as file in <present-working-dir>/htmlOutput

Then, the HTML file is converted to DOCX file using _pandoc_ library.

### Prerequisites

This is an example of how to list things you need to use the software and how to install them.
* Install node version >16 and npm version > 10
  ```sh
  [Installation Guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
* Install pandoc and librsvg
  ```sh
  brew install pandoc librsvg
* Install all the dependent node modules for this project
  ```sh
  yarn or npm i

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

Use the below command to see the running options
```sh
node index.js --help
```

You can run this program using two modes. 
1. Using particular PageID to convert to Docx
   1. Run the program with PageId as follows
   ```sh
   node index.js -p "<pageId>" >> console.log
   Ex: node index.js -p "987114" >> console.log
   Please use the console.log file to cross-verify the output state
   ```
2. Using a specific spaceId to convert to Docx. In this scenario all the pages in this space will be converted to the Docx format.
   1. Run the program with SpaceKey as follows
   ```sh
   node index.js -s "<spaceKey>" >> console.log
   Ex: node index.js -s "freshsales" >> console.log
   ```
# NOTE: If we pass both -s (or --spaceKey) and -p (--pageId) together, program will default to pageId extraction and ignore the "-s" key. This is to avoid unintentional space extraction which would cause more resources and time to complete

<p align="right">(<a href="#readme-top">back to top</a>)</p>
