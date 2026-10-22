(setq data (vector 42 7 19 3 88 21 5 64))

(defun swap (a i j)
  (let* ((held (aref a i)))
    (setf (aref a i) (aref a j))
    (setf (aref a j) held)))

(defun sort_ (a n)
  (let* ((j 0))
    (loop for i from 1 below n do
      (setf j i)
      (loop while (and (> j 0) (> (aref a (- j 1)) (aref a j))) do
        (swap a (- j 1) j)
        (decf j)))))

(defun show (a n)
  (dotimes (i n)
    (when (> i 0) (format t ", "))
    (format t "~d" (aref a i)))
  (format t "~%"))

(defun main ()
  (let* ((small (make-array 5 :initial-element 0)))
    (show data 8)
    (sort_ data 8)
    (show data 8)
    (fill small 0)
    (setf (aref small 0) 9)
    (setf (aref small 1) 2)
    (setf (aref small 2) 7)
    (sort_ small 5)
    (show small 5)))

(main)
