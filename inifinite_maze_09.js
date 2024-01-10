/**
The MIT License (MIT)

Copyright (c) 2024 Matt Payne

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
*	This JavaScript file creates an infinite, randomly-generated maze.
*	As the "Character" moves up the maze, new rows of blocks are generated and old ones discarded.
*
*	The maze is a changeable grid of Block objects laid over a permanent grid of points.
*	Each new Block object is set as a black Wall by default.
*	The program creates paths out of the blocks.
*
*	There is one "main" path which never travels downward.
*	Branching paths may go in any direction.
*
*	The maze appears as a square, but it is really three times as tall as it is wide.
*	Two thirds of the maze is invisible, with the path laid out off-screen.
*	This avoids the effect of newly-generated paths "popping" into existence from somewhere above.
*
*	The number of blocks in the grid can conveniently be changed by adjusting "numberOfRowBlocks" variable.
*	We recommend a number smaller than fifty. It gets ugly around 70, and may get slow by 100.
*	50 is lots! But feel free to try higher numbers if your computer can handle it.
*
*/

window.onload = start;

var context;
var mazeCanvas;

//Dimensions:
//Change the numberOfRowBlocks to define the number of blocks on each side.
var squareLength;
var numberOfRowBlocks = 30;
var numberOfRowPoints;

//The pointGrid stays in place forever, even as the maze generates new rows of blocks.
//The program will always use the static pointGrid as a reference for location within the canvas.
var pointGrid;
var maze;
var mainPath;
var paths = [];
var pathSeeds = [];   //pathSeeds are blocks which will branch off into new paths
var secondSeeds = [];
var pathsToSplice = [];

var character;
var characterCircleRadius;

//Path-creation variables
var currentBlock;
var currentRow;


function start() {

	setupCanvas();
	setupKeyListener();

	calculateDimensions();

	makePointGrid();
	makeMaze();
	makePath();
	makeCharacter();

	drawMaze();
	drawCharacter();
}

/**
*	Get the html canvas, get it's context, and get its dimensions.
*	The dimensions set IN THE HTML TAG are important for resolution and shape.
*/
function setupCanvas() {
	mazeCanvas = document.getElementById("mazeCanvas");
	context = mazeCanvas.getContext('2d');
	mazeCanvas.height = document.getElementById("mazeCanvas").height;
	mazeCanvas.width = document.getElementById("mazeCanvas").width;
}

/**
*	Tell the browser to send a signal to our program when certain keys are pressed (W,A,S,D), and then perform a certain function for each key.
*/
function setupKeyListener() {
	document.addEventListener('keydown', function (event) {
		if (event.keyCode == 87) {
			// W
			moveUp();
		}
		else if (event.keyCode == 65) {
			//A
			moveLeft();
		}
		else if (event.keyCode == 83) {
			//S
			moveDown();
		}
		else if (event.keyCode == 68) {
			//D
			moveRight();
		}
	});

}

/**
*	The canvas size (Height & Width) and the number of Blocks per row are already decided. 
*	This critical function calculates the size of the blocks based on the previously mentioned dimensions.
*	For now we are only dealing with square grids.
*/
function calculateDimensions() {
	squareLength = mazeCanvas.width / numberOfRowBlocks;
	numberOfRowPoints = numberOfRowBlocks + 1;
	characterCircleRadius = squareLength / 2;
}

/**
	This function creates a grid of points which extends above the canvas. That's four points for every block, with each block sharing
	corner-points with the blocks around it.
*/
function makePointGrid() {
	pointGrid = new PointGrid();

	//Make thrice as many rows as we will need,
	//so they can constantly auto-generate off-screen before the character gets there.
	for (var i = 0; i < numberOfRowPoints * 3; i++) {
		//These new Rows are permanent Row objects which never move.
		pointGrid.rows[i] = new Row();

		for (var k = 0; k < numberOfRowPoints; k++) {
			pointGrid.rows[i].points[k] = new Point(
				k * squareLength,
				(i * squareLength) - (numberOfRowPoints * 2 * squareLength)
			);
		}
	}

}

/**
	This function also creates a grid,
	but it's a grid of Block objects which can either be wall-blocks or floor blocks.
	So this essentially creates a map of blocks, based on the grid of points from the makePointGrid function.
*/
function makeMaze() {
	maze = new Maze();
	var fourPoints = [];

	for (var i = 0; i < pointGrid.rows.length - 2; i++) {
		//These new Rows are changeable Row objects will may flow over top of the pointGrid's rows.
		maze.rows[i] = new Row();

		for (var k = 0; k < pointGrid.rows[i].points.length - 2; k++) {
			fourPoints[0] = new Point(pointGrid.rows[i].points[k].x, pointGrid.rows[i].points[k].y);
			fourPoints[1] = new Point(pointGrid.rows[i].points[k + 1].x, pointGrid.rows[i].points[k + 1].y);
			fourPoints[2] = new Point(pointGrid.rows[i + 1].points[k + 1].x, pointGrid.rows[i + 1].points[k + 1].y);
			fourPoints[3] = new Point(pointGrid.rows[i + 1].points[k].x, pointGrid.rows[i + 1].points[k].y);

			maze.rows[i].blocks[k] = new Block(fourPoints);
			maze.rows[i].blocks[k].rowIndex = i;
			maze.rows[i].blocks[k].blockIndex = k;

			fourPoints = [];
		}
	}

	/**
	*	Now that all the blocks have been created,
	*	give each one a list of his adjacent blocks.
	*	This helps us get information when generating paths.
	*/
	for (var i = 0; i < maze.rows.length; i++) {
		for (var k = 0; k < maze.rows[i].blocks.length; k++) {
			getAdjacentBlocks(maze.rows[i].blocks[k]);
		}
	}
}

/**
	This function turns a few Blocks from wall-blocks into floor-blocks.
	Note that the path array BEGINS at the END of the rowIndex (rows start at y-0... but the PATH starts at maze.rows.length-2)
*/
function makePath() {
	mainPath = new Path();
	mainPath.distance = numberOfRowBlocks * 20;
	var createPath = true;
	var possibleNextBlocks = [];
	pathSeeds = [];

	currentRow = maze.rows[maze.rows.length - 1];

	//get a random block from the bottom row.
	var randomBlockIndex = Math.floor(Math.random() * (currentRow.blocks.length - 1)) + 1;
	currentBlock = currentRow.blocks[randomBlockIndex];
	currentBlock.isWall = false;
	mainPath.subPath[0] = currentBlock;
	//move up ONE row and make that block part of the path.
	currentRow = maze.rows[maze.rows.length - 2];

	currentBlock = currentRow.blocks[randomBlockIndex];
	currentBlock.isWall = false;
	mainPath.subPath[1] = currentBlock;

	//Each iteration of this while-loop attempts to add a single Block object to the Path's subPath array.
	//I duplicate parts of this while-loop several times because it's needed in slightly different contexts.
	//If I can, I will turn it into a single function. But for now this is the best way.
	while (createPath == true) {
		var nBlock;
		possibleNextBlocks = [];

		//Check each block adjacent to the "currentBlock" (Block at the end of the path)
		//and see if it fits the criteria for being added to the path.
		for (var i = 0; i < currentBlock.adjacentBlocks.length; i++) {
			nBlock = currentBlock.adjacentBlocks[i];

			if (nBlock.rowIndex > 0 && nBlock.rowIndex <= currentBlock.rowIndex && nBlock.blockIndex > 0 && nBlock.blockIndex < numberOfRowBlocks - 1 && nBlock.isWall == true) {
				possibleNextBlocks[possibleNextBlocks.length] = nBlock;

				checkForWallBlocks(nBlock);
				if (nBlock.numberOfAdjacentWalls > 1) {
					possibleNextBlocks[possibleNextBlocks.length] = nBlock;
				}
				if (nBlock.numberOfAdjacentWalls > 2) {
					possibleNextBlocks[possibleNextBlocks.length] = nBlock;
				}

			}
		}

		//Conditions for pausing the path's growth
		if (currentBlock.rowIndex == 1 || possibleNextBlocks.length == 0) {
			createPath = false;
		}
		else  //Add a valid block to the path
		{
			currentBlock = possibleNextBlocks[Math.floor(Math.random() * possibleNextBlocks.length)];
			currentBlock.isWall = false;
			mainPath.subPath[mainPath.subPath.length] = currentBlock;

			if (Math.floor(Math.random() * 21) < 4) {
				//At random intervals, set aside a block to be the seed for a new path
				pathSeeds[pathSeeds.length] = currentBlock;
			}
		}

	}

	for (var i = 0; i < pathSeeds.length; i++) {
		makeSubPath(pathSeeds[i]);
	}

	//The makeSubPath function sets aside MORE blocks as "second" seeds for more branching paths
	pathSeeds = secondSeeds;

	for (var i = 0; i < pathSeeds.length; i++) {
		makeSubPath(pathSeeds[i]);
	}

	//Some paths have outgrown their usefulness. Splice them.
	for (var i = 0; i < pathsToSplice.length; i++) {
		paths.splice(paths.indexOf(pathsToSplice[i]), 1);
	}

	pathSeeds = [];
	secondSeeds = [];
	pathsToSplice = [];
}

//This function makes secondary offshoots from the main path.
//It replicates a lot of the code from the function that makes the mainPath,
//but I want the freedom to apply different rules to a subPath.
//
//This function needs to be fed a seed block.
function makeSubPath(firstBlock) {
	var newPath = new Path();

	newPath.distance = Math.floor(Math.random() * (numberOfRowBlocks * 2));
	newPath.subPath[0] = firstBlock;

	currentBlock = firstBlock;
	var createPath = true;
	var possibleNextBlocks = [];

	while (createPath == true) {
		var nBlock;
		possibleNextBlocks = [];

		for (var i = 0; i < currentBlock.adjacentBlocks.length; i++) {
			nBlock = currentBlock.adjacentBlocks[i];
			checkForWallBlocks(nBlock);

			if (nBlock.rowIndex > 0 && nBlock.rowIndex <= maze.rows.length - 3 && nBlock.blockIndex > 0 && nBlock.blockIndex < numberOfRowBlocks - 1 && nBlock.isWall == true && nBlock.numberOfAdjacentWalls > 2) {
				possibleNextBlocks[possibleNextBlocks.length] = nBlock;
			}
			else if (nBlock.rowIndex == 1 && nBlock.numberOfAdjacentWalls > 1) {
				possibleNextBlocks[possibleNextBlocks.length] = nBlock;
			}

		}

		if (possibleNextBlocks.length > 0) {
			currentBlock = possibleNextBlocks[Math.floor(Math.random() * possibleNextBlocks.length)];
			currentBlock.isWall = false;
			newPath.subPath[newPath.subPath.length] = currentBlock;
		}

		if (currentBlock.rowIndex == 1 || possibleNextBlocks.length == 0 || newPath.subPath.length >= newPath.distance) {
			createPath = false;

			if (possibleNextBlocks.length == 0 || newPath.subPath.length >= newPath.distance) {
				//If this path is too long, or if it can't generate more blocks,
				//set it aside to be spliced from the array of paths.
				pathsToSplice[pathsToSplice.length] = newPath;
			}


		} else if (Math.floor(Math.random() * 20) < 3) {
			//At random intervals, set aside a block as a seed to generate a new path.
			secondSeeds[secondSeeds.length] = currentBlock;
		}

	}

}

/**
*	There may be many reasons to get a list of blocks adjacent to any specific block.
*	This function fills the block's "adjacentBlocks" list with those blocks.
*	The list will start at the top with [0], and move clockwise for [1, 2, 3].
*/
function getAdjacentBlocks(middleBlock) {
	var aBlocks = [];
	var thisRowIndex = middleBlock.rowIndex;
	var thisBlockIndex = middleBlock.blockIndex;


	//check to see if each block really exists, then add that block to the list.
	if (thisRowIndex > 0) {
		aBlocks[aBlocks.length] = maze.rows[thisRowIndex - 1].blocks[thisBlockIndex];

	}

	if (thisBlockIndex < numberOfRowBlocks - 2) {
		aBlocks[aBlocks.length] = maze.rows[thisRowIndex].blocks[thisBlockIndex + 1];

	}

	if (thisRowIndex < maze.rows.length - 3) {
		aBlocks[aBlocks.length] = maze.rows[thisRowIndex + 1].blocks[thisBlockIndex];
	}

	if (thisBlockIndex > 0) {
		aBlocks[aBlocks.length] = maze.rows[thisRowIndex].blocks[thisBlockIndex - 1];
	}

	middleBlock.adjacentBlocks = aBlocks;
}

//I might delete this function.
//This function cycles through all the blocks and sets their adjacentBlocks lists.
function resetAdjacentBlocks() {
	for (var i = maze.rows.length - 1; i > 0; i--) {
		for (var k = 0; k < maze.rows[i].blocks.length; k++) {
			getAdjacentBlocks(maze.rows[i].blocks[k]);
		}
	}
}

//This function creates a Character object and set its location on the map.
//(The first block in the mainPath's arraylist of blocks)
function makeCharacter() {
	character = new Character();
	character.location = mainPath.subPath[0];
}

/**
	This function just iterates through each block in each row of the maze, and tells the drawBlock function to draw that block.
*/
function drawMaze() {
	var block;
	context.strokeStyle = "#2E64FE";

	context.fillStyle = "#000000";
	context.fillRect(0, 0, mazeCanvas.width, mazeCanvas.height);

	for (var i = 0; i < maze.rows.length; i++) {
		for (var h = 0; h < maze.rows[i].blocks.length; h++) {
			block = maze.rows[i].blocks[h];

			drawBlock(block);
		}
	}
}

//Draw one block.
//Its colour depends on whether it's a wall or not.
function drawBlock(block) {
	context.fillStyle = "#FFFFFF";
	if (block.isWall == true) {
		context.fillStyle = "#000000";
	}
	context.fillRect(block.points[0].x, block.points[0].y, squareLength + 1, squareLength + 1);
}

//Draw the character on whatever block it occupies.
function drawCharacter() {
	context.strokeStyle = "#000000";
	context.fillStyle = "#FF0000";
	context.beginPath();
	context.arc(character.location.centerPoint.x, character.location.centerPoint.y, characterCircleRadius, 0, 2 * Math.PI);
	context.fill();
	context.stroke();
	context.closePath();

}

//The next few functions handle user input, moving the character through the maze.
//First we have to make sure the character is not moving into a wall.
//If the character is moving into a valid path block, change the character's location,
//redraw the maze, and redraw the character.

//The moveUp function can shift the whole maze down, causing the generation of a new row.
function moveUp() {
	var currentLocation = character.location;
	var possibleNewLocation;

	possibleNewLocation = maze.rows[currentLocation.rowIndex - 1].blocks[currentLocation.blockIndex];


	if (possibleNewLocation.isWall == false) {
		//If we've reached halfway up the visible map, shift the maze to make new rows.
		if (possibleNewLocation.rowIndex < (maze.rows.length * (5 / 6)) - 1) {
			shiftMaze();
		}

		character.location = possibleNewLocation;
		drawMaze();
		drawCharacter();
	}
}

function moveDown() {
	var currentLocation = character.location;
	var possibleNewLocation = maze.rows[currentLocation.rowIndex + 1].blocks[currentLocation.blockIndex];

	if (possibleNewLocation.isWall == false) {
		drawMaze();
		character.location = possibleNewLocation;
		drawCharacter();
	}
}

function moveLeft() {
	var currentLocation = character.location;
	var possibleNewLocation = maze.rows[currentLocation.rowIndex].blocks[currentLocation.blockIndex - 1];

	if (possibleNewLocation.isWall == false) {
		drawMaze();
		character.location = possibleNewLocation;
		drawCharacter();
	}
}

function moveRight() {
	var currentLocation = character.location;
	var possibleNewLocation = maze.rows[currentLocation.rowIndex].blocks[currentLocation.blockIndex + 1];

	if (possibleNewLocation.isWall == false) {
		drawMaze();
		character.location = possibleNewLocation;
		drawCharacter();
	}
}

//These next few functions perform all the functions necessary to move the maze down, add new rows,
//and remove the old, abandoned rows.
function shiftMaze() {
	//cut all ties to the row we've just abandoned below us.
	for (var i = 0; i < maze.rows[maze.rows.length - 1].blocks.length; i++) {
		maze.rows[maze.rows.length - 1].blocks[i].adjacentBlocks = [];
	}

	for (var i = maze.rows.length - 1; i > 0; i--) {
		maze.rows[i] = maze.rows[i - 1];

		for (var k = 0; k < maze.rows[i].blocks.length; k++) {
			moveBlockDown(maze.rows[i].blocks[k]);
		}
	}

	createNewRow();
	resetAdjacentBlocks();
	shiftPaths();
}

function moveBlockDown(mBlock) {
	mBlock.rowIndex++;
	mBlock.centerPoint.y += squareLength;
	for (var f = 0; f < mBlock.points.length; f++) {
		mBlock.points[f].y += squareLength;

	}
}

function createNewRow() {
	var fourPoints = [];

	maze.rows[0] = new Row();

	for (var k = 0; k < pointGrid.rows[0].points.length - 2; k++) {
		fourPoints[0] = new Point(pointGrid.rows[0].points[k].x, pointGrid.rows[0].points[k].y);
		fourPoints[1] = new Point(pointGrid.rows[0].points[k + 1].x, pointGrid.rows[0].points[k + 1].y);
		fourPoints[2] = new Point(pointGrid.rows[1].points[k + 1].x, pointGrid.rows[1].points[k + 1].y);
		fourPoints[3] = new Point(pointGrid.rows[1].points[k].x, pointGrid.rows[1].points[k].y);

		maze.rows[0].blocks[k] = new Block(fourPoints);
		maze.rows[0].blocks[k].rowIndex = 0;
		maze.rows[0].blocks[k].blockIndex = k;

		fourPoints = [];
	}
	resetAdjacentBlocks();

}

//Now that the maze and all its blocks have been shifted, and new rows generated,
//We need to extend our paths.
function shiftPaths() {

	//Splice out the dead paths
	for (var i = 0; i < pathsToSplice.length; i++) {
		paths.splice(paths.indexOf(pathsToSplice[i]), 1);
	}
	pathsToSplice = [];

	extendMainPath();

	//make new subPaths from the mainPath
	for (var i = 0; i < pathSeeds.length; i++) {
		makeSubPath(pathSeeds[i]);
	}

	pathSeeds = [];
	//perpetuate any existing subPaths
	for (var i = 1; i < paths.length; i++) {
		extendPaths(paths[i]);
		if (paths[i].subPath.length == 0) {
			pathsToSplice[pathsToSplice.length] = paths[i];
		}
	}


	pathSeeds = secondSeeds;

	//create new subPaths FROM the secondary branches
	for (var i = 0; i < pathSeeds.length; i++) {
		makeSubPath(pathSeeds[i]);
	}

	pathSeeds = [];
	secondSeeds = [];


}

function extendMainPath() {
	var latestBlock = mainPath.subPath[mainPath.subPath.length - 1];
	var createPath = true;
	var possibleNextBlocks = [];

	//Another variation on the while-loop that adds blocks to a path.
	while (createPath == true) {
		var nBlock;
		possibleNextBlocks = [];

		for (var i = 0; i < latestBlock.adjacentBlocks.length; i++) {
			nBlock = latestBlock.adjacentBlocks[i];
			checkForWallBlocks(nBlock);

			if (nBlock.rowIndex > 0 && nBlock.rowIndex <= latestBlock.rowIndex && nBlock.blockIndex > 0 && nBlock.blockIndex < numberOfRowBlocks && nBlock.isWall == true && nBlock.numberOfAdjacentWalls > 1) {
				possibleNextBlocks[possibleNextBlocks.length] = nBlock;
			}
			else if (nBlock.rowIndex == 1 && nBlock.numberOfAdjacentWalls > 2) {
				possibleNextBlocks[possibleNextBlocks.length] = nBlock;
			}

		}

		if (possibleNextBlocks.length > 0) {
			latestBlock = possibleNextBlocks[Math.floor(Math.random() * possibleNextBlocks.length)];
			latestBlock.isWall = false;
			mainPath.subPath[mainPath.subPath.length] = latestBlock;
			mainPath.subPath.splice(0, 1);
		}

		if (latestBlock.rowIndex == 1 || possibleNextBlocks.length == 0) {
			createPath = false;
		} else if (Math.floor(Math.random() * 7) < 1) {
			pathSeeds[pathSeeds.length] = latestBlock;
		}
	}

}

//Extend all the secondary paths
function extendPaths(thisPath) {
	var latestBlock = thisPath.subPath[thisPath.subPath.length - 1];
	var createPath = true;
	var possibleNextBlocks = [];

	getAdjacentBlocks(latestBlock);

	while (createPath == true) {
		var nBlock;
		possibleNextBlocks = [];

		for (var i = 0; i < latestBlock.adjacentBlocks.length; i++) {
			nBlock = latestBlock.adjacentBlocks[i];
			checkForWallBlocks(nBlock);

			if (nBlock.rowIndex > 0 && nBlock.rowIndex <= maze.rows.length - 3 && nBlock.blockIndex > 0 && nBlock.blockIndex < numberOfRowBlocks - 1 && nBlock.isWall == true && nBlock.numberOfAdjacentWalls > 2) {
				possibleNextBlocks[possibleNextBlocks.length] = nBlock;
			}
		}



		if (possibleNextBlocks.length > 0) {
			latestBlock = possibleNextBlocks[Math.floor(Math.random() * possibleNextBlocks.length)];
			latestBlock.isWall = false;
			thisPath.subPath[thisPath.subPath.length] = latestBlock;

			if (Math.floor(Math.random() * 9) < 1) {
				secondSeeds[secondSeeds.length] = latestBlock;
			}
		}

		if (latestBlock.rowIndex == 1 || possibleNextBlocks.length == 0 || thisPath.subPath.length >= thisPath.distance) {
			createPath = false;

			if (thisPath.subPath.length >= thisPath.distance || possibleNextBlocks.length == 0 || nBlock.rowIndex >= maze.rows.length - 3) {
				pathsToSplice[pathsToSplice.length] = thisPath;
			}

		}
	}

}



function checkForWallBlocks(thisBlock) {
	thisBlock.numberOfAdjacentWalls = 0;
	for (var i = 0; i < thisBlock.adjacentBlocks.length; i++) {
		if (thisBlock.adjacentBlocks[i].isWall) {
			thisBlock.numberOfAdjacentWalls++;
		}
	}
}



//These are the functions which act as classes for objects in the game.

function Character() {
	this.location;

}

function Maze() {
	this.rows = [];

}

function Block(fourPoints) {
	this.points = fourPoints;
	this.isWall = true;

	this.centerPoint = new Point(this.points[1].x - (squareLength / 2), this.points[2].y - (squareLength / 2));

	this.rowIndex;
	this.blockIndex;
	this.adjacentBlocks = [];
	this.numberOfAdjacentWalls = 0;
}

function Path() {
	this.subPath = [];
	this.distance = 0;
	paths[paths.length] = this;

}

function PointGrid() {
	this.rows = [];
}

//A Row may hold either Block objects, or Point objects, or both.
function Row() {
	this.points = [];
	this.blocks = [];
}

/*
 * "Point" is the class for point objects in an animation.
 */
function Point(newPointX, newPointY) {
	this.x = newPointX;
	this.y = newPointY;
}