sudo yum groupinstall "Development Tools"
sudo yum imstall libtool cmake
install protocol buffers from https://github.com/google/protobuf/releases
  ./autogen.sh
  ./configure
  make
  sudo make install

git clone https://github.com/Ultimaker/libArcus.git
  nano CMakeLists.txt --- BUILD_PYTHON OFF
  cd libArcus
  mkdir build
  cd build
  cmake ..
  make
  sudo make install
  
  
