var Dgeni = require('dgeni');
var Package = require('dgeni').Package;
var path = require('path');
var _ = require('lodash');
var fse = require('fs-extra');
var bower = require('bower');
var wiredep = require('wiredep');
var Q = require('q');
var pkg = require('../package.json');

/**
 * Default packages, may be overridden by {@link DocGen#package}
 * @type {Array}
 */
var DEFAULT_PACKAGES = [
    require('dgeni-packages/ngdoc'),
    require('dgeni-packages/nunjucks'),
    require('dgeni-packages/examples')
];

/**
 * Applies default package configuration, might be overridden later
 */
function configurePackage(p) {
    // append services
    p.factory(require('./services/getNativeTypeLink'))
     .factory(require('./services/getTypeLink'))
     .factory(require('./services/getTypeName'))
     .factory(require('./services/transforms/accessTagTransform'))
     .factory(require('./services/transforms/errorTagTransform'))

     // build navigation
     .processor(require('./processors/config'))
     .processor(require('./processors/embedImages'))
     .processor(require('./processors/generateErrorsGroupArea'))
     .processor(require('./processors/index'))
     .processor(require('./processors/navigation'))
     .processor(require('./processors/structuredParam'))
     .processor(require('./processors/website'))
     .processor(require('./processors/exampleDependenciesBuilder'))

     // change default url for native types doc
//     .config(function(getNativeTypeLink) {
//        getNativeTypeLink.nativeTypeRoot = 'http://w3.org';
//      })

     // generate website
     .config(function(generateWebsite) {
        generateWebsite
         .locals('version', pkg.version)
         .locals('title', pkg.title)
         .locals('url', pkg.homepage);
     })

     // add navigation area mappers
     .config(function(generateNavigationProcessor, getInjectables) {
        generateNavigationProcessor.addMappers(getInjectables([
          require('./processors/mappers/api'),
          require('./processors/mappers/docs'),
          require('./processors/mappers/error'),
          require('./processors/mappers/guide')
        ]));
      })

     // add filters
     .config(function(templateEngine, getInjectables) {
        templateEngine.filters = templateEngine.filters.concat(getInjectables([
          require('./rendering/filters/keys'),
          require('./rendering/filters/type-link'),
          require('./rendering/filters/type-name')
        ]));
      })

     // add more templates location
     .config(function(templateFinder) {
        templateFinder.templateFolders.unshift(path.resolve(__dirname, 'templates'));
      })

     // do not assume links to be 
     .config(function(checkAnchorLinksProcessor) {
        checkAnchorLinksProcessor.base = '/';
      })

     .config(function(parseTagsProcessor, getInjectables) {
        getInjectables(require('./tag-defs')).forEach(function(v) {
            parseTagsProcessor.tagDefinitions.push(v);
        });
     })

     // setting readFilesProcessor configuration
     .config(function(computePathsProcessor, computeIdsProcessor, createDocMessage, getAliases) {

        computeIdsProcessor.idTemplates.push({
            docTypes: ['overview'],
            idTemplate: '${area}:${name}',
            getAliases: getAliases
        });

        computeIdsProcessor.idTemplates.push({
            docTypes: ['area'],
            idTemplate: '${docType}:${area}',
            getAliases: getAliases
        });

        computeIdsProcessor.idTemplates.push({
            docTypes: ['controller'],
            idTemplate: 'module:${module}.${docType}:${name}',
            getAliases: getAliases
        });

        computeIdsProcessor.idTemplates.push({
            docTypes: ['error'],
            idTemplate: 'module:${module}.${docType}:${name}',
            getAliases: getAliases
        });

        computeIdsProcessor.idTemplates.push({
            docTypes: ['factory'],
            idTemplate: 'module:${module}.${docType}:${name}',
            getAliases: getAliases
        });

        computePathsProcessor.pathTemplates.push({
            docTypes: ['area'],
            pathTemplate: '${area}',
            outputPathTemplate: 'partials/${area}.html'
        });

        computePathsProcessor.pathTemplates.push({
            docTypes: ['controller'],
            pathTemplate: '${area}/${module}/${docType}/${name}',
            outputPathTemplate: 'partials/${area}/${module}/${docType}/${name}.html'
        });

        computePathsProcessor.pathTemplates.push({
            docTypes: ['factory'],
            pathTemplate: '${area}/${module}/${docType}/${name}',
            outputPathTemplate: 'partials/${area}/${module}/${docType}/${name}.html'
        });

        computePathsProcessor.pathTemplates.push({
            docTypes: ['error'],
            pathTemplate: '${area}/${module}/${name}',
            outputPathTemplate: 'partials/error/${module}/${name}.html'
        });

        computePathsProcessor.pathTemplates.push({
            docTypes: ['module'],
            pathTemplate: '${area}/${name}',
            outputPathTemplate: 'partials/${path}.html'
        });

        computePathsProcessor.pathTemplates.push({
            docTypes: ['overview'],
            pathTemplate: '${area}/${name}',
/*
            getPath: function(doc) {
                var docPath = path.dirname(doc.fileInfo.relativePath);
                if (doc.fileInfo.baseName !== 'index') {
                    docPath = path.join(docPath,
                        doc.fileInfo.baseName);
                } else {
                    return 'index';
                }
                return docPath;
            },
*/
//            outputPathTemplate: 'partials/${path}.html'
            outputPathTemplate: 'partials/${area}/${name}.html'
        });

        computePathsProcessor.pathTemplates.push({
            docTypes: ['componentGroup'],
            pathTemplate: '${area}/${moduleName}/${groupType}',
            outputPathTemplate: 'partials/${area}/${moduleName}/${groupType}.html'
        });
    });

    return p;
}

function DocGen () {
    var pkg;
    var dest;

    /**
     * Builds package and returns instance
     * @returns {Package} package instance singleton
     */
    this.package = function (p) {
        if (!pkg) {
            var packages = (p && [].concat(p) || DEFAULT_PACKAGES || []).map(function(packageName) {
                if ('string' == typeof packageName) {
                    return require(packageName);
                } else {
                    return packageName;
                }
            });
            pkg = configurePackage(new Package('grunt-dgeni', packages));
        }
        return pkg;
    }

    /**
     * Appends sources to process
     *
     * @param {String, Array} src - file sources
     * @param {String} basepath - path to sources
     * @returns {DocGen}
     */
    this.src = function (src, basepath) {
        this.package().config(function(readFilesProcessor) {
            readFilesProcessor.basePath = path.resolve(basepath || '');

            readFilesProcessor.sourceFiles = (readFilesProcessor.sourceFiles || []).concat([].concat(src.map(function(sourceInfo) {
                return {
                    include: sourceInfo,
                };
            })));
        });
        return this;
    }

    /**
     * Defines docs title
     *
     * @param {String} title docs title
     * @returns {DocGen}
     */
    this.title = function (title) {
        this.package().config(function(generateConfigProcessor, generateWebsite) {
            generateConfigProcessor.title(title);
            generateWebsite.locals('productTitle', title);
        });
        return this;
    }

    /**
     * Defines docs version
     *
     * @param {String} version docs version
     * @returns {DocGen}
     */
    this.version = function (version) {
        this.package().config(function(generateConfigProcessor, generateWebsite) {
            generateConfigProcessor.version(version);
            generateWebsite.locals('productVersion', version);
        });
        return this;
    }

    /**
     * Sets destination path
     * @param {String} p
     * @returns {DocGen}
     */
    this.dest = function (p) {
        dest = path.resolve(p);
        this.package().config(function(writeFilesProcessor) {
            writeFilesProcessor.outputFolder = dest;
        });
        return this;
    }

    /**
     * Runs generator
     * @returns {Promise}
     */
    this.generate = function () {
        return new Dgeni([this.package()]).generate().then(function(data) {
            var defer = Q.defer();

            // copy app data
//            console.log('Copy everything from' + path.join(__dirname, 'app') + ' to ' + dest);
//            fse.copySync(path.join(__dirname, 'app'), dest);

            // provide bower deps
            process.chdir(dest);
            var z = bower.commands.install([],{});

            z.on('end', function(){
                defer.resolve(data);
            });

            z.on('error', function (err) {
                defer.reject(err);
            });

            // wiredep
            return defer.promise.then(function(data) {
                wiredep({
                    src: ['index.html']
                });
                return data;
            });
        });
    }
}
/**
 * @returns generator instance
 */
module.exports = function() {
    return new DocGen();
}
