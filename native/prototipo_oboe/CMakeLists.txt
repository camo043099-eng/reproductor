# SIN PROBAR. Pensado para un módulo nativo de prueba; NO está enlazado en el build de la app.
# Oboe y libFLAC se descargan con FetchContent (como en el proyecto Mornye). Versiones a fijar al implementar.
cmake_minimum_required(VERSION 3.22.1)
project(onda_hires_proto LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)

add_library(onda_hires_proto SHARED
    eq_core.cpp
    flac_reader.cpp
    oboe_output.cpp)
target_include_directories(onda_hires_proto PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
# TODO: find_package/FetchContent de oboe y FLAC; target_link_libraries(... oboe FLAC log)
