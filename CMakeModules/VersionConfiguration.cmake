# Get the current date.
# include(WebClientVariables)
string(TIMESTAMP CURRENT_DATE "%Y-%m-%d")

# Get git revision version
include(GetGitRevisionDescription)
get_git_head_revision(REFSPEC FULL_GIT_REVISION)
if(FULL_GIT_REVISION STREQUAL "GITDIR-NOTFOUND")
 set(GIT_REVISION "git")
else(FULL_GIT_REVISION STREQUAL "GITDIR-NOTFOUND")
 string(SUBSTRING ${FULL_GIT_REVISION} 0 8 GIT_REVISION)
endif(FULL_GIT_REVISION STREQUAL "GITDIR-NOTFOUND")

# Get git branch name
execute_process(
  COMMAND git rev-parse --abbrev-ref HEAD
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE GIT_BRANCH
  OUTPUT_STRIP_TRAILING_WHITESPACE
)

# Get the build number if available
if(DEFINED ENV{BUILD_NUMBER})
  set(VERSION_BUILD "$ENV{BUILD_NUMBER}")
  set(VERSION_BUILD_NR "$ENV{BUILD_NUMBER}")
else()
  set(VERSION_BUILD "dev")
  set(VERSION_BUILD_NR "0")
endif()

set(VERSION_MAJOR 1)
set(VERSION_MINOR 12)
set(VERSION_NANO 0)

option(UPGRADE_DEBUG "" OFF)

set(VERSION_STRING "1.12.0")
set(VERSION_STRING_SHORT "1.12.0")
set(CANONICAL_VERSION_STRING "1.12.0")
set(JWCUSTOM_VERSION_DESC "1.12.0-JW-${GIT_BRANCH}-${GIT_REVISION}")

configure_file(src/core/Version.cpp.in src/core/Version.cpp)

if(WIN32)
  configure_file(bundle/win/version.rc.in bundle/win/version.rc)
endif()
