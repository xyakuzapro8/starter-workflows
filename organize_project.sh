#!/bin/bash

# Create directories
mkdir -p src tests docs

# Move source files to src
mv *.js src/ 2>/dev/null
mv *.ts src/ 2>/dev/null

# Move test files to tests
mv *.test.js tests/ 2>/dev/null
mv *.spec.js tests/ 2>/dev/null

# Move documentation files to docs
mv *.md docs/ 2>/dev/null

# Remove unnecessary files
rm -rf workflow-features

echo "Project organized successfully."
