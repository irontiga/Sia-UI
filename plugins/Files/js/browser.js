'use strict';

/*
 * browser instance module:
 *   browser is the manager that renders file/folder elements and navigates
 *   through a user's sia files
 */

// Node modules
const electron = require('electron');
const clipboard = electron.clipboard;
const fs = require('fs');
const path = require('path');
const $ = require('jquery');
const siad = require('sia.js');
const tools = require('./uiTools');
const fileElement = require('./fileElement');
const folderElement = require('./folderElement');
const loader = require('./loader');

// Root folder object to hold all other file and folder objects
var rootFolder = require('./folderFactory')('');
var currentFolder = rootFolder;
// Point of reference for shift-click multi-select
var anchor;
// Keeps track of if there is content in the search bar
var searching = '';

// Get rid of an anchor
function deselectAnchor() {
	if (anchor) {
		anchor.removeClass('anchor');
		anchor = null;
	}
}

// Make an element the anchor
function selectAnchor(el) {
	if (!el || el.length === 0) {
		return;
	}
	deselectAnchor();
	anchor = el;
	el.addClass('anchor');
	el.addClass('selected');
}

// Show action buttons if there are selected files
function checkActionButtons() {
	var someSelected = $('.selected').length;
	var buttonsAreVisible = $('.controls .button').is(':visible');
	if (someSelected && !buttonsAreVisible) {
		$('.controls .button').fadeIn('fast');
	} else if (!someSelected && buttonsAreVisible) {
		$('.controls .button').fadeOut('fast');
	}
}

// Returns selected files/folders from currentFolder
function getSelectedFiles() {
	var selected = $('.selected.file');
	var nameFields = selected.map((i, el) => $(el).find('.name')).get();
	var names = nameFields.map(field => field.text());
	return names.map(name => currentFolder.files[name]);
}

// Refresh the file list according to the currentFolder
// TODO: folders before files, sort alphabetically
function updateList(navigateTo) {
	// Get rid of all elements that don't belong
	var files = currentFolder.filesArray;
	var hashes = files.map(file => file.hashedPath);
	$('.file:not(.label)').each(function() {
		if (!hashes.includes(this.id)) {
			$(this).remove();
		}
	});

	// Refresh the list
	files.forEach(file => {
		if (file.type === 'file') {
			// Make and display a file element
			fileElement(file);
		} else if (file.type === 'folder') {
			// Make and display a folder element
			folderElement(file, navigateTo);
		} else {
			console.error('Unknown file type: ' + file.type, file);
		}
	});

	// Sort files to be folder first and then alphabetical
	$('#file-list .file').sort(function(a, b) {
		if ($(a).hasClass('folder') !== $(b).hasClass('folder')) {
			return $(a).hasClass('folder') ? -1 : 1;
		} else {
			return $(a).find('.name').text().localeCompare($(b).find('.name').text());
		}
	}).appendTo('#file-list');
	checkActionButtons();
}

// Update file from api result
function updateFile(file) {
	var fileFolders = file.siapath.split('/');
	var fileName = fileFolders.pop();

	// Make any needed folders
	var folderIterator = rootFolder;
	fileFolders.forEach(function(folderName) {
		// Continue to next folder or make folder if it doesn't already exist
		folderIterator = folderIterator.files[folderName] ? folderIterator.files[folderName] : folderIterator.addFolder(folderName);
	});

	// Make file if needed
	if (!folderIterator.files[fileName]) {
		return folderIterator.addFile(file);
	} else {
		// Update the stats on the file object
		return folderIterator.files[fileName].update(file);
	}
}

// Update file from api files
function updateFiles(fileObjects) {
	// Update or add each file
	fileObjects.forEach(function(file) {
		var f = updateFile(file);
	});

	// Track files to find old files
	var paths = fileObjects.map(fo => fo.siapath);
	var allFiles = rootFolder.filesArrayDeep;
	var oldFiles = allFiles.filter(f => !paths.includes(f.path));

	// Remove elements of and pointers to nonexistent files
	oldFiles.forEach(f => {
		// Unless it's an empty folder
		if (f.type === 'folder' && f.isEmpty()) {
			return;
		}
		$('#' + f.hashedPath).remove();
		delete f.parentFolder.files[f.name];
	});
}

// Refresh the folder list representing the current working directory
function updateCWD(navigateTo) {
	var cwd = $('#cwd');
	var oldPath = cwd.children().last().attr('id');
	if (oldPath === currentFolder.path) {
		return;
	}
	cwd.empty();
	var folders = currentFolder.parentFolders;
	folders.push(currentFolder);

	// Add a directory element per folder
	folders.forEach(function(f, i) {
		var el = $(`
			<span class='button directory' id='${f.path}'>
			</span>
		`);
		// Root folder
		if (f.path === '') {
			el.html('<i class=\'fa fa-folder\'></i> ');
		} else {
			// Middle folders
			el.html(f.name);
		}

		// Last folder
		if (i === folders.length - 1) {
			el.append(' <i class=\'fa fa-caret-down\'></i>');
		} else {
			el.append('/');
		}

		// Clicking the element navigates to that folder
		el.click(function() {
			navigateTo(f);
		});

		// Append and add icon for root folder
		cwd.append(el);
	});

	// Sum up widths to move dropdown right as directory is deeper
	var cwdLength = 0;
	cwd.children().not(':last').each(function() {
		var width = Number($(this).css('width').slice(0, -2));
		cwdLength += width;
	});

	// New file/folder button appears below last folder
	cwd.children().last().off('click').click(function() {
		var dropdown = $('.hidden.dropdown');
		dropdown.css('left', cwdLength + 'px');
		dropdown.toggle('fast');
	});
}

// The browser object
var browser = {
	// Update files in the browser
	update (callback) {
		searching = $('#search-bar').val();
		siad.apiCall('/renter/files', function(results) {
			// Update the current working directory
			updateCWD(browser.navigateTo);
			if (!searching) {
				// Add or update each file from a `renter/files/list` call
				updateFiles(results.files);
				// Update the file list
				updateList(browser.navigateTo);
			}
			if (typeof callback === 'function') {
				callback();
			}
		});
	},

	// Expose these, mostly for debugging purposes
	get currentFolder () {
		return currentFolder;
	},
	get rootFolder () {
		return rootFolder;
	},

	// Select an item in the current folder
	select (el) {
		selectAnchor(el);
		checkActionButtons();
	},
	toggle (el) {
		deselectAnchor();
		el.toggleClass('selected');
		if (el.hasClass('selected')) {
			selectAnchor(el);
		}
		checkActionButtons();
	},

	// Select items from the last selected file to the one passed in
	selectTo (el) {
		if (!anchor) {
			this.select(el);
		} else if (el.length !== 0) {
			$('#file-list .file').removeClass('selected');
			anchor.addClass('selected');
			el.addClass('selected');
			if (el.index() > anchor.index()) {
				anchor.nextUntil(el).addClass('selected');
			} else {
				el.nextUntil(anchor).addClass('selected');
			}
		}
		checkActionButtons();
	},

	// Select all items in the current folder
	selectAll () {
		deselectAnchor();
		$('#file-list .file').addClass('selected');
		checkActionButtons();
	},

	// Deselect all items in the current folder
	deselectAll (exception) {
		if (exception !== anchor) {
			deselectAnchor();
		}
		$('#file-list .file').not(exception).removeClass('selected');
		checkActionButtons();
	},

	// Deletes selected files
	deleteSelected () {
		var files = getSelectedFiles();
		var itemCount = files.length;
		var label;

		// Check for any selected files, and make messages singular or plural 
		if (itemCount === 0) {
			tools.tooltip('No selected files', $('.controls .delete').get(0));
			return;
		} else if (itemCount === 1) {
			label = files[0].name;
		} else {
			let totalCount = files.reduce(function(a, b) {
				if (b.type === 'folder') {
					return a + b.count;
				} else {
					return ++a;
				}
			}, 0);
			label = totalCount + ' files';
		}

		// Confirm deletion
		var confirmation = tools.dialog('message', {
			type:    'warning',
			title:   'Confirm Deletion',
			message: `Are you sure you want to delete ${label}?`,
			detail:  'This will remove it from your library!',
			buttons: ['Okay', 'Cancel'],
		});
		if (confirmation === 1) {
			return;
		}

		// Delete files and file elements
		files.forEach(function(file) {
			file.delete(function() {
				$('#' + file.hashedPath).remove();
			});
		});
	},

	// Renames a selected file
	renameSelected () {
		var files = getSelectedFiles();
		var itemCount = files.length;
		var label;

		// Check for any selected files, and make messages singular or plural 
		if (itemCount === 0) {
			tools.tooltip('No selected files', $('.controls .rename').get(0));
			return;
		} else if (itemCount === 1) {
			var el = $("div[id='" + files[0].name + "']");
			// Use timeout to prevent loss of focus
			setTimeout(function() {
				el.prop('contentEditable', true);
				el.focus();
				el.parent().addClass('selected');
			}, 100);
		}
		return;
	},

	// Prompts user for Ascii or .sia method of sharing
	shareSelected () {
		var files = getSelectedFiles();
		var itemCount = files.length;
		var label;
		var paths;

		// Check for any selected files, and make messages singular or plural
		// Also get paths of selected files, including files several layers
		// inside a folder, in a one dimensional array
		if (itemCount === 0) {
			tools.tooltip('No selected files', $('.controls .share').get(0));
			return;
		} else if (itemCount === 1) {
			let file = files[0];
			label = file.name;
			paths = file.type === 'folder' ? file.paths : [file.path];
		} else {
			// Reduce array of files to array of all file paths
			paths = files.reduce(function(a, b) {
				if (b.type === 'folder') {
					return a.concat(b.paths);
				} else {
					a.push(b.path);
					return a;
				}
			}, []);
			label = paths.length + ' files';
		}

		// Present option between .Sia or ASCII method of sharing
		var option = tools.dialog('message', {
			type:    'question',
			title:   'Share ' + label,
			message: 'Share via .sia file or ASCII text?',
			detail:  'Choose to download .sia file or copy ASCII text to clipboard.',
			buttons: ['.Sia file', 'ASCII text', 'Cancel'],
		});

		// Choose a location to download the .sia file to
		if (option === 0) {
			let dialogOptions = {
				title:       'Share .sia for ' + label,
				filters:     [{ name: 'Sia file', extensions: ['sia'] }],
			};
			if (itemCount === 1) {
				dialogOptions.defaultPath = label;
			}
			var destination = tools.dialog('save', dialogOptions);

			// Ensure destination exists
			if (!destination) {
				return;
			}

			// Place siafile to location
			tools.notify(`Sharing ${label} to ${destination}`, 'siafile');
			loader.shareDotSia(paths, destination, function() {
				tools.notify(`Put ${label}'s .sia files at ${destination}`, 'success');
			});
		} else if (option === 1) {
			// Get the ascii share string
			tools.notify(`Getting ascii for ${label}`, 'asciifile');
			loader.shareAscii(paths, function(result) {
				// Write it to system clipboard
				clipboard.writeText(result.asciisia);
				tools.notify(`Copied ascii for ${label} to clipboard!`, 'asciifile');
			});
		}
	},

	// Prompts user for destination and downloads selected files to it
	downloadSelected () {
		var files = getSelectedFiles();
		var itemCount = files.length;
		var label;
		var destination;

		// Check for any selected files, and make messages singular or plural 
		if (itemCount === 0) {
			tools.tooltip('No selected files', $('.controls .download').get(0));
			return;
		} else if (itemCount === 1) {
			if (files[0].type === 'folder') {
				tools.notify('No support for downloading folders (yet)', 'error');
				return;
			}
			label = files[0].name;
			destination = tools.dialog('save', {
				title: 'Download ' + label,
				defaultPath: label,
			});
			if (!destination) {
				return;
			}
			// Download the file
			files[0].download(destination, function() {
				tools.notify(`Downloaded ${label} to ${destination}`, 'success');
			});
		} else {
			for (let file of files) {
				if (file.type === 'folder') {
					tools.notify('No support for downloading folders (yet)', 'error');
					return;
				}
			}
			// Save files into directory
			label = itemCount + ' files';
			destination = tools.dialog('open', {
				title: 'Download ' + label,
				properties: ['openDirectory', 'createDirectory'],
			});
			if (!destination) {
				return;
			}
			// Download each of the files
			tools.notify(`Downloading ${label} to ${destination}`, 'download');
			let functs = files.map(file => file.download.bind(file));
			let destinations = files.map(file => path.join(destination, file.name));
			tools.waterfall(functs, destinations, function() {
				tools.notify(`Downloaded ${label} to ${destination}`, 'success');
			});
		}
	},

	// Filter file list by search string
	filter (searchstr) {
		searching = searchstr;
		if (!searchstr) {
			return;
		}
		// Clear file list
		$('#file-list').empty();

		// Match files and make the elements
		var files = currentFolder.filesArrayDeep;
		files = files.filter(file => file.path.includes(searchstr));
		var eles = files.map(file => fileElement(file));

		// Show full path for the entry when searching
		eles.forEach(function(el, i) {
			el.find('.name').text(files[i].path);
		});
	},

	// Navigate to a given folder or rootFolder by default
	navigateTo (folder) {
		folder = folder.type === 'folder' ? folder : rootFolder;
		currentFolder = folder;
		browser.update();
	},

	// Makes a new folder element temporarily
	makeFolder (userInput, callback) {
		var name = 'New Folder';
		// Ensure unique name
		if (currentFolder.files[name]) {
			var n = 0;
			while (currentFolder.files[`${name}_${n}`]) {
				n++;
			}
			name = `${name}_${n}`;
		}
		var folder = currentFolder.addFolder(name);
		var element = folderElement(folder, browser.navigateTo);
		$('#file-list').append(element);
		if (callback) {
			callback();
		}
	},
};

// Redirects dropdown options (see global.js) to their respective functions
browser['Make Folder'] = browser.makeFolder;
browser['Upload File'] = function uploadFiles(filePaths, callback) {
	// Files upload to currentFolder.path/name by default
	tools.notify(`Uploading ${filePaths.length} file(s)!`, 'upload');
	tools.waterfall(loader.uploadFile, filePaths, currentFolder.path, function() {
		// tools.notify(`Upload for ${filePaths.length} file(s) completed!`, 'success');
		callback();
	});
};
browser['Upload Folder'] = function uploadFolders(dirPaths, callback) {
	// Uploads to currentFolder.path/name, keeping their original structure
	tools.notify(`Uploading ${dirPaths.length} folder(s)!`, 'upload');
	tools.waterfall(loader.uploadFolder, dirPaths, currentFolder.path, function() {
		// tools.notify(`Upload for ${dirPaths.length} folder(s) completed!`, 'success');
		callback();
	});
};
browser['Load .Sia File'] = function loadDotSias(filePaths, callback) {
	tools.notify(`Loading ${filePaths.length} .sia file(s)!`, 'siafile');
	tools.waterfall(loader.loadDotSia, filePaths, function() {
		tools.notify(`Loaded ${filePaths.length} .sia(s) file(s)!`, 'success');
		callback();
	});
};
browser['Load ASCII File'] = loader.loadAscii;

module.exports = browser;
