'use strict';

/*
 * file class module:
 *   file is an object literal meant to interpret, hold, and change
 *   information about renter files. 
 */

// Node modules
const path = require('path');
const $ = require('jquery');
const siad = require('sia.js');
const tools = require('./uiTools');

var file = {
	// Properties every file should have
	type:         'file',
	path:         '',
	parentFolder: null,

	// Update/record file stats
	update (stats) {
		if (tools.notType(stats, 'object')) {
			return;
		}
		Object.assign(this, stats);
		this.path = stats.siapath;
		return this;
	},

	// Get array of folder objects that contain this particular file
	get parentFolders () {
		// path of 'foo/bar/baz' would return folder objects whose paths are
		// 'foo' and 'foo/bar' respectively
		var parentFolders = [];
		// iterate through parentFolder links to populate parentFolders
		for (let i = this.parentFolder; i; i = i.parentFolder) {
			parentFolders.push(i);
		}
		return parentFolders.reverse();
	},

	// The below are just function forms of the renter calls a file can enact
	// on itself, see the API.md
	// https://github.com/NebulousLabs/Sia/blob/master/doc/API.md#renter

	// Changes file's siapath with siad call
	setPath (newPath, callback) {
		if (tools.notType(newPath, 'string')) {
			return;
		}
		siad.apiCall({
			url: '/renter/rename/' + this.path ,
			method: 'POST',
			qs: {
				newsiapath: newPath,
			},
		}, () => {
			this.path = newPath;
			if (callback) {
				callback(newPath);
			}
		});
	},
	delete (callback) {
		siad.apiCall({
			url: '/renter/delete/' + this.path,
			method: 'POST',
		}, result => {
			delete this.parentFolder.files[this.name];
			callback(result);
		});
	},
	download (destination, callback) {
		if (tools.notType(destination, 'string')) {
			return;
		}
		siad.apiCall({
			url: '/renter/download/' + this.path,
			qs: {
				destination: destination,
			},
		}, callback);
	},
	share (destination, callback) {
		if (tools.notType(destination, 'string')) {
			return;
		} else if (destination.slice(-4) !== '.sia') {
			console.error('Share path needs end in ".sia"!', destination);
			return;
		}
		siad.apiCall({
			url: '/renter/share',
			qs: {
				siapaths: [this.path],
				destination: destination,
			},
		}, callback);
	},
	shareASCII (callback) {
		siad.apiCall({
			url: '/renter/shareascii',
			qs: {
				siapaths: [this.path],
			},
		}, callback);
	},

	// Path related functions
	get name () {
		// path of 'foo/bar/baz' would return 'baz'
		if (this.path.slice(-1) === '/') {
			return '';
		} else {
			return path.basename(this.path);
		}
	},
	get pathArray () {
		// path of 'foo/bar/baz' would return ['foo', 'bar', 'baz]
		return this.path.split('/');
	},
	get directory () {
		// path of 'foo/bar/baz' would return 'foo/bar'
		return this.pathArray.slice(0, -1).join('/');
	},
	get folderNames () {
		// path of 'foo/bar/baz' would return ['foo', 'bar']
		return this.directory.split('/');
	},
	get extension () {
		return path.extname(this.path);
	},
	get nameNoExtension () {
		return path.basename(this.path, this.extension);
	},
	// Since spaces, chinese characters, etc. are allowable in file names but
	// not in html ids, hashedPath() gets a unique representations of files that
	// is html id friendly
	get hashedPath() {
		return require('crypto').createHash('md5').update(this.path).digest('hex');
	},

	// These can't use set syntax because they're necessarily asynchronous
	setName (newName, cb) {
		if (tools.notType(newName, 'string')) {
			return;
		}
		var d = this.directory;
		var newPath = d === '' ? newName : `${d}/${newName}`;
		this.setPath(newPath, cb);
	},
	setDirectory (newDirectory, cb) {
		if (tools.notType(newDirectory, 'string')) {
			return;
		}
		var newPath = newDirectory === '' ? this.name : `${newDirectory}/${this.name}`;
		this.setPath(newPath, cb);
	},
	setExtension (newExtension, cb) {
		if (tools.notType(newExtension, 'string')) {
			return;
		}
		var d = this.directory;
		var newPath = d === '' ? '' : d + '/';
		newPath = newPath + this.nameNoExtension + newExtension;
		this.setPath(newPath, cb);
	},
};

module.exports = file;
