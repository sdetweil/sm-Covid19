#!/bin/bash
cp .pre-commit .git/hooks/pre-commit
fs=$(stat -c%s ../../app/locales/en.json)
if [ $fs -lt 1000 ]; then
	# nls enabled
	source=config.schema.json.nls
	# if the compiled trans files exist
	if [ -e ../../app/locales/enc.json ]; then
	    # erase so they will be reqbuilt
	  rm ../../app/locales/??c.json
	fi
else
	# nls NOT enabled
	source=config.schema.json.no-nls
fi
cp $source config.schema.json
